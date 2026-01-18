import { Prisma, TaskStatus, TaskType } from "@prisma/client";
import { randomUUID } from "crypto";
import { requireAuth } from "../../../../lib/api-auth";
import {
  handleAuthError,
  ok,
} from "../../../../lib/api-response";
import { applyAutomationForTask } from "../../../../lib/automation";
import { badPoints } from "../../../../lib/points";
import { logAudit } from "../../../../lib/audit";
import { TaskUpdateSchema } from "../../../../lib/contracts/task";
import { createDomainErrors, errorResponse } from "../../../../lib/http/errors";
import { parseBody } from "../../../../lib/http/validation";
import prisma from "../../../../lib/prisma";
import { TASK_STATUS, TASK_TYPE } from "../../../../lib/types";
import { resolveWorkspaceId } from "../../../../lib/workspace-context";

const isTaskStatus = (value: unknown): value is TaskStatus =>
  Object.values(TASK_STATUS).includes(value as TaskStatus);

const isTaskType = (value: unknown): value is TaskType =>
  Object.values(TASK_TYPE).includes(value as TaskType);

const toNullableJsonInput = (
  value: unknown | null | undefined,
): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.DbNull;
  return value as Prisma.InputJsonValue;
};

const toChecklist = (value: unknown) => {
  if (value === null) return null;
  if (!Array.isArray(value)) return undefined;
  return value
    .map((item) => ({
      id: typeof item?.id === "string" ? item.id : randomUUID(),
      text: String(item?.text ?? "").trim(),
      done: Boolean(item?.done),
    }))
    .filter((item) => item.text.length > 0);
};

const normalizeChecklistForReset = (value: unknown) => {
  if (!Array.isArray(value)) return null;
  return value
    .map((item) => {
      if (item && typeof item === "object") {
        const obj = item as Record<string, unknown>;
        const text = typeof obj.text === "string" ? obj.text : String(obj.text ?? "");
        return {
          id: typeof obj.id === "string" ? obj.id : randomUUID(),
          text: text.trim(),
          done: false,
        };
      }
      const fallback = String(item ?? "").trim();
      return {
        id: randomUUID(),
        text: fallback,
        done: false,
      };
    })
    .filter((item) => item.text.length > 0);
};

const nextRoutineAt = (cadence: "DAILY" | "WEEKLY", base: Date) => {
  const next = new Date(base);
  if (cadence === "DAILY") {
    next.setDate(next.getDate() + 1);
  } else {
    next.setDate(next.getDate() + 7);
  }
  return next;
};
const errors = createDomainErrors("TASK");

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await parseBody(request, TaskUpdateSchema, {
    code: "TASK_VALIDATION",
  });
  console.info("TASK_UPDATE input", {
    id,
    status: body.status,
    type: body.type,
    checklistType: Array.isArray(body.checklist) ? "array" : typeof body.checklist,
    checklistNull: body.checklist === null,
  });
  const data: Record<string, unknown> = {};

  if (body.title) data.title = body.title;
  if (typeof body.description === "string") data.description = body.description;
  if (typeof body.definitionOfDone === "string") {
    data.definitionOfDone = body.definitionOfDone;
  }
  const checklistValue = toChecklist(body.checklist);
  if (checklistValue !== undefined) {
    data.checklist = checklistValue;
  }
  if (body.points !== undefined && body.points !== null) {
    if (badPoints(body.points)) {
      return errors.badRequest("points must be one of 1,2,3,5,8,13,21,34");
    }
    data.points = Number(body.points);
  }
  if (body.urgency) data.urgency = body.urgency;
  if (body.risk) data.risk = body.risk;
  if (body.type !== undefined) {
    data.type = isTaskType(body.type) ? body.type : TASK_TYPE.PBI;
  }
  if (body.dueDate !== undefined) {
    data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
  }
  if (body.tags !== undefined) {
    data.tags = Array.isArray(body.tags) ? body.tags.map((tag: string) => String(tag)) : [];
  }
  const statusValue = body.status && isTaskStatus(body.status) ? body.status : null;
  console.info("TASK_UPDATE narrowed", {
    statusValue,
    typeValue: data.type ?? null,
  });
  if (statusValue) {
    data.status = statusValue;
  }
  const cadenceValue =
    body.routineCadence === "DAILY" || body.routineCadence === "WEEKLY"
      ? body.routineCadence
      : null;
  const shouldClearRoutine =
    body.routineCadence === null ||
    body.routineCadence === "" ||
    body.routineCadence === "NONE";
  const routineNextAt =
    body.routineNextAt !== undefined && body.routineNextAt !== null
      ? new Date(body.routineNextAt)
      : null;

  try {
    const { userId } = await requireAuth();
    const workspaceId = await resolveWorkspaceId(userId);
    if (!workspaceId) {
      return errors.notFound("workspace not selected");
    }
    const currentTask = await prisma.task.findFirst({
      where: { id, workspaceId },
      include: { routineRule: true },
    });
    if (!currentTask) {
      return errors.notFound();
    }
    if (statusValue === TASK_STATUS.SPRINT || statusValue === TASK_STATUS.DONE) {
      const blocking = await prisma.taskDependency.findMany({
        where: {
          taskId: id,
          dependsOn: { status: { not: TASK_STATUS.DONE } },
        },
        select: { dependsOn: { select: { id: true, title: true, status: true } } },
      });
      if (blocking.length > 0) {
        return errors.badRequest("dependencies must be done before moving");
      }
    }
    if (body.assigneeId !== undefined) {
      const nextAssigneeId = body.assigneeId ? String(body.assigneeId) : null;
      if (nextAssigneeId) {
        const member = await prisma.workspaceMember.findUnique({
          where: { workspaceId_userId: { workspaceId, userId: nextAssigneeId } },
          select: { userId: true },
        });
        data.assigneeId = member ? nextAssigneeId : null;
      } else {
        data.assigneeId = null;
      }
    }
    if (body.parentId !== undefined) {
      const nextParentId = body.parentId ? String(body.parentId) : null;
      if (nextParentId && nextParentId !== id) {
        const parent = await prisma.task.findFirst({
          where: { id: nextParentId, workspaceId },
          select: { id: true },
        });
        data.parentId = parent ? parent.id : null;
      } else {
        data.parentId = null;
      }
    }
    if (statusValue === TASK_STATUS.SPRINT) {
      const activeSprint = await prisma.sprint.findFirst({
        where: { workspaceId, status: "ACTIVE" },
        orderBy: { startedAt: "desc" },
        select: { id: true, capacityPoints: true },
      });
      if (!activeSprint) {
        return errors.badRequest("active sprint not found");
      }
      const current = await prisma.task.aggregate({
        where: { workspaceId, status: TASK_STATUS.SPRINT, id: { not: id } },
        _sum: { points: true },
      });
      const currentPoints = currentTask.points ?? 0;
      const nextPoints =
        (current._sum.points ?? 0) + (typeof data.points === "number" ? data.points : currentPoints);
      if (nextPoints > activeSprint.capacityPoints) {
        return errors.badRequest("sprint capacity exceeded");
      }
      data.sprintId = activeSprint?.id ?? null;
    }
    if (statusValue === TASK_STATUS.BACKLOG) {
      data.sprintId = null;
    }
    const updated = await prisma.task.updateMany({
      where: { id, workspaceId },
      data,
    });
    if (!updated.count) {
      return errors.notFound();
    }
    const task = await prisma.task.findFirst({
      where: { id, workspaceId },
      include: { routineRule: true },
    });
    if (Array.isArray(body.dependencyIds)) {
      const dependencyIds = body.dependencyIds.map((depId: string) => String(depId));
      const allowed = dependencyIds.length
        ? await prisma.task.findMany({
            where: { id: { in: dependencyIds }, workspaceId },
            select: { id: true },
          })
        : [];
      await prisma.taskDependency.deleteMany({ where: { taskId: id } });
      if (allowed.length > 0) {
        await prisma.taskDependency.createMany({
          data: allowed
            .map((dep) => dep.id)
            .filter((depId) => depId && depId !== id)
            .map((depId) => ({ taskId: id, dependsOnId: depId })),
          skipDuplicates: true,
        });
      }
    }
    if (task) {
      const finalType = (task.type ?? TASK_TYPE.PBI) as string;
      if (finalType !== TASK_TYPE.ROUTINE && task.routineRule) {
        await prisma.routineRule.delete({ where: { taskId: task.id } });
      } else if (finalType === TASK_TYPE.ROUTINE) {
        if (cadenceValue) {
          const baseDate = task.dueDate ? new Date(task.dueDate) : new Date();
          const nextAt = routineNextAt ?? task.routineRule?.nextAt ?? nextRoutineAt(cadenceValue, baseDate);
          await prisma.routineRule.upsert({
            where: { taskId: task.id },
            update: { cadence: cadenceValue, nextAt },
            create: { taskId: task.id, cadence: cadenceValue, nextAt },
          });
        } else if (routineNextAt && task.routineRule) {
          await prisma.routineRule.update({
            where: { taskId: task.id },
            data: { nextAt: routineNextAt },
          });
        } else if (shouldClearRoutine && task.routineRule) {
          await prisma.routineRule.delete({ where: { taskId: task.id } });
        }
      }
    }

    await logAudit({
      actorId: userId,
      action: "TASK_UPDATE",
      targetWorkspaceId: workspaceId,
      metadata: { taskId: id },
    });
    if (task && statusValue && currentTask.status !== statusValue) {
      await prisma.taskStatusEvent.create({
        data: {
          taskId: task.id,
          fromStatus: currentTask.status ?? null,
          toStatus: statusValue,
          actorId: userId,
          source: "api",
          workspaceId,
        },
      });
    }
    if (
      task &&
      statusValue === TASK_STATUS.DONE &&
      currentTask.status !== TASK_STATUS.DONE &&
      task.type === TASK_TYPE.ROUTINE
    ) {
      const rule = task.routineRule
        ? task.routineRule
        : await prisma.routineRule.findUnique({ where: { taskId: task.id } });
      if (rule) {
        const now = new Date();
        const dueAt = rule.nextAt && rule.nextAt > now ? rule.nextAt : now;
        const nextAt = nextRoutineAt(rule.cadence as "DAILY" | "WEEKLY", dueAt);
        const resetChecklist = normalizeChecklistForReset(task.checklist);
        const created = await prisma.task.create({
          data: {
            title: task.title,
            description: task.description ?? "",
            definitionOfDone: task.definitionOfDone ?? "",
            checklist: toNullableJsonInput(resetChecklist),
            points: task.points,
            urgency: task.urgency,
            risk: task.risk,
            status: TASK_STATUS.BACKLOG,
            type: TASK_TYPE.ROUTINE,
            dueDate: dueAt,
            tags: task.tags ?? [],
            assigneeId: task.assigneeId ?? null,
            userId: task.userId ?? userId,
            workspaceId,
          },
        });
        await prisma.routineRule.update({
          where: { taskId: task.id },
          data: { taskId: created.id, nextAt },
        });
        await prisma.taskStatusEvent.create({
          data: {
            taskId: created.id,
            fromStatus: null,
            toStatus: TASK_STATUS.BACKLOG,
            actorId: userId,
            source: "routine",
            workspaceId,
          },
        });
        await applyAutomationForTask({
          userId,
          workspaceId,
          task: {
            id: created.id,
            title: created.title,
            description: created.description ?? "",
            points: created.points,
            status: created.status,
          },
        });
      }
    }
    if (task) {
      await applyAutomationForTask({
        userId,
        workspaceId,
        task: {
          id: task.id,
          title: task.title,
          description: task.description ?? "",
          points: task.points,
          status: task.status,
        },
      });
    }
    return ok({ task });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    console.error("PATCH /api/tasks/[id] error", error);
    return errorResponse(error, {
      code: "TASK_INTERNAL",
      message: "failed to update task",
      status: 500,
    });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const { userId } = await requireAuth();
    const workspaceId = await resolveWorkspaceId(userId);
    if (!workspaceId) {
      return errors.notFound("workspace not selected");
    }
    await prisma.taskDependency.deleteMany({ where: { taskId: id } });
    await prisma.aiSuggestion.deleteMany({ where: { taskId: id } });
    const deleted = await prisma.task.deleteMany({ where: { id, workspaceId } });
    if (!deleted.count) {
      return errors.notFound();
    }
    await logAudit({
      actorId: userId,
      action: "TASK_DELETE",
      targetWorkspaceId: workspaceId,
      metadata: { taskId: id },
    });
    return ok({ ok: true });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    console.error("DELETE /api/tasks/[id] error", error);
    return errorResponse(error, {
      code: "TASK_INTERNAL",
      message: "failed to delete task",
      status: 500,
    });
  }
}
