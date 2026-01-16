import { AuthError, requireAuth } from "../../../lib/api-auth";
import {
  badRequest,
  handleAuthError,
  ok,
  serverError,
} from "../../../lib/api-response";
import { applyAutomationForTask } from "../../../lib/automation";
import prisma from "../../../lib/prisma";
import { TASK_STATUS } from "../../../lib/types";
import { resolveWorkspaceId } from "../../../lib/workspace-context";

export async function GET() {
  try {
    const { userId } = await requireAuth();
    const workspaceId = await resolveWorkspaceId(userId);
    if (!workspaceId) {
      return ok({ tasks: [] });
    }
    const tasks = await prisma.task.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
    });
    return ok({ tasks });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    console.error("GET /api/tasks error", error);
    return serverError("failed to load tasks");
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await requireAuth();
    const body = await request.json();
    const { title, description, points, urgency, risk, status } = body;
    if (!title || points === undefined || points === null) {
      return badRequest("title and points are required");
    }
    const workspaceId = await resolveWorkspaceId(userId);
    if (!workspaceId) {
      return badRequest("workspace is required");
    }
    const statusValue = Object.values(TASK_STATUS).includes(status)
      ? status
      : TASK_STATUS.BACKLOG;
    const activeSprint =
      statusValue === TASK_STATUS.SPRINT
        ? await prisma.sprint.findFirst({
            where: { workspaceId, status: "ACTIVE" },
            orderBy: { startedAt: "desc" },
            select: { id: true },
          })
        : null;
    const task = await prisma.task.create({
      data: {
        title,
        description: description ?? "",
        points: Number(points),
        urgency: urgency ?? "中",
        risk: risk ?? "中",
        status: statusValue,
        sprintId: activeSprint?.id ?? null,
        userId,
        workspaceId,
      },
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
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    console.error("POST /api/tasks error", error);
    return serverError("failed to create task");
  }
}
