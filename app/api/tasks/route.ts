import { Prisma, TaskStatus, TaskType } from "@prisma/client";
import { randomUUID } from "crypto";
import { requireAuth } from "../../../lib/api-auth";
import { withApiHandler } from "../../../lib/api-handler";
import { ok } from "../../../lib/api-response";
import { applyAutomationForTask } from "../../../lib/automation";
import { badPoints } from "../../../lib/points";
import { logAudit } from "../../../lib/audit";
import { TaskCreateSchema } from "../../../lib/contracts/task";
import { createDomainErrors } from "../../../lib/http/errors";
import { parseBody } from "../../../lib/http/validation";
import prisma from "../../../lib/prisma";
import { TASK_STATUS, TASK_TYPE } from "../../../lib/types";
import { mapTaskWithDependencies } from "../../../lib/mappers/task";
import { resolveWorkspaceId } from "../../../lib/workspace-context";

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
  if (!Array.isArray(value)) return null;
  return value
    .map((item) => ({
      id: typeof item?.id === "string" ? item.id : randomUUID(),
      text: String(item?.text ?? "").trim(),
      done: Boolean(item?.done),
    }))
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

export async function GET() {
  return withApiHandler(
    {
      logLabel: "GET /api/tasks",
      errorFallback: {
        code: "TASK_INTERNAL",
        message: "failed to load tasks",
        status: 500,
      },
    },
    async () => {
    const { userId } = await requireAuth();
    const workspaceId = await resolveWorkspaceId(userId);
    if (!workspaceId) {
      return ok({ tasks: [] });
    }
    const tasks = await prisma.task.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      include: {
        routineRule: {
          select: { cadence: true, nextAt: true },
        },
        dependencies: {
          select: {
            dependsOnId: true,
            dependsOn: { select: { id: true, title: true, status: true } },
          },
        },
      },
    });
      return ok({
        tasks: tasks.map(mapTaskWithDependencies),
      });
    },
  );
}

export async function POST(request: Request) {
  return withApiHandler(
    {
      logLabel: "POST /api/tasks",
      errorFallback: {
        code: "TASK_INTERNAL",
        message: "failed to create task",
        status: 500,
      },
    },
    async () => {
      const { userId } = await requireAuth();
      const body = await parseBody(request, TaskCreateSchema, {
        code: "TASK_VALIDATION",
      });
      console.info("TASK_CREATE input", {
        status: body.status,
        type: body.type,
        checklistType: Array.isArray(body.checklist) ? "array" : typeof body.checklist,
        checklistNull: body.checklist === null,
      });
      const {
        title,
        description,
        definitionOfDone,
        checklist,
        points,
        urgency,
        risk,
        status,
        type,
        parentId,
        dueDate,
        assigneeId,
        tags,
        dependencyIds,
        routineCadence,
        routineNextAt,
      } = body;
      if (badPoints(points)) {
        return errors.badRequest("points must be one of 1,2,3,5,8,13,21,34");
      }
      const workspaceId = await resolveWorkspaceId(userId);
      if (!workspaceId) {
        return errors.badRequest("workspace is required");
      }
      let safeAssigneeId: string | null = assigneeId ?? null;
      if (safeAssigneeId) {
        const member = await prisma.workspaceMember.findUnique({
          where: { workspaceId_userId: { workspaceId, userId: safeAssigneeId } },
          select: { userId: true },
        });
        if (!member) {
          safeAssigneeId = null;
        }
      }
      const dependencyList = Array.isArray(dependencyIds)
        ? dependencyIds.map((id: string) => String(id))
        : [];
      const allowedDependencies = dependencyList.length
        ? await prisma.task.findMany({
            where: { id: { in: dependencyList }, workspaceId },
            select: { id: true, title: true, status: true },
          })
        : [];
      const statusValue = isTaskStatus(status) ? status : TASK_STATUS.BACKLOG;
      const typeValue = isTaskType(type) ? type : TASK_TYPE.PBI;
      console.info("TASK_CREATE narrowed", {
        statusValue,
        typeValue,
      });
      const parentCandidate = parentId ? String(parentId) : null;
      const parent = parentCandidate
        ? await prisma.task.findFirst({
            where: { id: parentCandidate, workspaceId },
            select: { id: true },
          })
        : null;
      if (
        statusValue !== TASK_STATUS.BACKLOG &&
        allowedDependencies.some((dep) => dep.status !== TASK_STATUS.DONE)
      ) {
        return errors.badRequest("dependencies must be done before moving to sprint");
      }
      const activeSprint =
        statusValue === TASK_STATUS.SPRINT
          ? await prisma.sprint.findFirst({
              where: { workspaceId, status: "ACTIVE" },
              orderBy: { startedAt: "desc" },
              select: { id: true, capacityPoints: true },
            })
          : null;
      if (statusValue === TASK_STATUS.SPRINT && activeSprint) {
        const current = await prisma.task.aggregate({
          where: { workspaceId, status: TASK_STATUS.SPRINT },
          _sum: { points: true },
        });
        const nextTotal = (current._sum.points ?? 0) + Number(points);
        if (nextTotal > activeSprint.capacityPoints) {
          return errors.badRequest("sprint capacity exceeded");
        }
      }
      const task = await prisma.task.create({
        data: {
          title,
          description: description ?? "",
          definitionOfDone: typeof definitionOfDone === "string" ? definitionOfDone : "",
          checklist: toNullableJsonInput(toChecklist(checklist)),
          points: Number(points),
          urgency: urgency ?? "中",
          risk: risk ?? "中",
          status: statusValue,
          dueDate: dueDate ? new Date(dueDate) : null,
          tags: Array.isArray(tags) ? tags.map((tag: string) => String(tag)) : [],
          type: typeValue,
          sprint: activeSprint ? { connect: { id: activeSprint.id } } : undefined,
          parent: parent ? { connect: { id: parent.id } } : undefined,
          assignee: safeAssigneeId ? { connect: { id: safeAssigneeId } } : undefined,
          user: { connect: { id: userId } },
          workspace: { connect: { id: workspaceId } },
        },
      });
      const cadenceValue =
        routineCadence === "DAILY" || routineCadence === "WEEKLY" ? routineCadence : null;
      if (typeValue === TASK_TYPE.ROUTINE && cadenceValue) {
        const baseDate = dueDate ? new Date(dueDate) : new Date();
        const nextAt = routineNextAt ? new Date(routineNextAt) : nextRoutineAt(cadenceValue, baseDate);
        await prisma.routineRule.create({
          data: {
            taskId: task.id,
            cadence: cadenceValue,
            nextAt,
          },
        });
      }
      if (allowedDependencies.length > 0) {
        await prisma.taskDependency.createMany({
          data: dependencyList
            .filter((id: string) => id && id !== task.id)
            .filter((id: string) => allowedDependencies.some((allowed) => allowed.id === id))
            .map((id: string) => ({
              taskId: task.id,
              dependsOnId: id,
            })),
          skipDuplicates: true,
        });
      }
      await prisma.taskStatusEvent.create({
        data: {
          taskId: task.id,
          fromStatus: null,
          toStatus: task.status,
          actorId: userId,
          source: "api",
          workspaceId,
        },
      });
      await logAudit({
        actorId: userId,
        action: "TASK_CREATE",
        targetWorkspaceId: workspaceId,
        metadata: { taskId: task.id, status: task.status },
      });
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
      return ok({ task });
    },
  );
}
