import { requireAuth } from "../../../../lib/api-auth";
import {
  badRequest,
  handleAuthError,
  notFound,
  ok,
} from "../../../../lib/api-response";
import { applyAutomationForTask } from "../../../../lib/automation";
import { badPoints } from "../../../../lib/points";
import { logAudit } from "../../../../lib/audit";
import prisma from "../../../../lib/prisma";
import { TASK_STATUS, TASK_TYPE } from "../../../../lib/types";
import { resolveWorkspaceId } from "../../../../lib/workspace-context";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  const data: Record<string, unknown> = {};

  if (body.title) data.title = body.title;
  if (typeof body.description === "string") data.description = body.description;
  if (body.points !== undefined && body.points !== null) {
    if (badPoints(body.points)) {
      return badRequest("points must be one of 1,2,3,5,8,13,21,34");
    }
    data.points = Number(body.points);
  }
  if (body.urgency) data.urgency = body.urgency;
  if (body.risk) data.risk = body.risk;
  if (body.type !== undefined) {
    data.type = Object.values(TASK_TYPE).includes(body.type) ? body.type : TASK_TYPE.PBI;
  }
  if (body.dueDate !== undefined) {
    data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
  }
  if (body.tags !== undefined) {
    data.tags = Array.isArray(body.tags) ? body.tags.map((tag: string) => String(tag)) : [];
  }
  const statusValue =
    body.status && Object.values(TASK_STATUS).includes(body.status)
      ? body.status
      : null;
  if (statusValue) {
    data.status = statusValue;
  }

  try {
    const { userId } = await requireAuth();
    const workspaceId = await resolveWorkspaceId(userId);
    if (!workspaceId) {
      return notFound("workspace not selected");
    }
    const currentTask = statusValue
      ? await prisma.task.findFirst({
          where: { id, workspaceId },
          select: { status: true, points: true },
        })
      : null;
    if (statusValue === TASK_STATUS.SPRINT || statusValue === TASK_STATUS.DONE) {
      const blocking = await prisma.taskDependency.findMany({
        where: {
          taskId: id,
          dependsOn: { status: { not: TASK_STATUS.DONE } },
        },
        select: { dependsOn: { select: { id: true, title: true, status: true } } },
      });
      if (blocking.length > 0) {
        return badRequest("dependencies must be done before moving");
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
        return badRequest("active sprint not found");
      }
      const current = await prisma.task.aggregate({
        where: { workspaceId, status: TASK_STATUS.SPRINT, id: { not: id } },
        _sum: { points: true },
      });
      const currentPoints = currentTask?.points ?? 0;
      const nextPoints =
        (current._sum.points ?? 0) + (typeof data.points === "number" ? data.points : currentPoints);
      if (nextPoints > activeSprint.capacityPoints) {
        return badRequest("sprint capacity exceeded");
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
      return notFound();
    }
    const task = await prisma.task.findFirst({
      where: { id, workspaceId },
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
    await logAudit({
      actorId: userId,
      action: "TASK_UPDATE",
      targetWorkspaceId: workspaceId,
      metadata: { taskId: id },
    });
    if (task && statusValue && currentTask?.status !== statusValue) {
      await prisma.taskStatusEvent.create({
        data: {
          taskId: task.id,
          fromStatus: currentTask?.status ?? null,
          toStatus: statusValue,
          actorId: userId,
          source: "api",
          workspaceId,
        },
      });
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
    return notFound("not found or update failed");
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
      return notFound("workspace not selected");
    }
    await prisma.taskDependency.deleteMany({ where: { taskId: id } });
    await prisma.aiSuggestion.deleteMany({ where: { taskId: id } });
    const deleted = await prisma.task.deleteMany({ where: { id, workspaceId } });
    if (!deleted.count) {
      return notFound();
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
    return notFound("not found or delete failed");
  }
}
