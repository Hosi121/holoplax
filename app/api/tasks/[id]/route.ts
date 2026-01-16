import { AuthError, requireAuth } from "../../../../lib/api-auth";
import {
  handleAuthError,
  notFound,
  ok,
  serverError,
} from "../../../../lib/api-response";
import { applyAutomationForTask } from "../../../../lib/automation";
import prisma from "../../../../lib/prisma";
import { TASK_STATUS } from "../../../../lib/types";
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
    data.points = Number(body.points);
  }
  if (body.urgency) data.urgency = body.urgency;
  if (body.risk) data.risk = body.risk;
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
    if (statusValue === TASK_STATUS.SPRINT) {
      const activeSprint = await prisma.sprint.findFirst({
        where: { workspaceId, status: "ACTIVE" },
        orderBy: { startedAt: "desc" },
        select: { id: true },
      });
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
    await prisma.aiSuggestion.deleteMany({ where: { taskId: id } });
    const deleted = await prisma.task.deleteMany({ where: { id, workspaceId } });
    if (!deleted.count) {
      return notFound();
    }
    return ok({ ok: true });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    console.error("DELETE /api/tasks/[id] error", error);
    return notFound("not found or delete failed");
  }
}
