import { AuthError, requireAuth } from "../../../lib/api-auth";
import {
  badRequest,
  handleAuthError,
  ok,
  serverError,
} from "../../../lib/api-response";
import { applyAutomationForTask } from "../../../lib/automation";
import { badPoints } from "../../../lib/points";
import { logAudit } from "../../../lib/audit";
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
      include: {
        dependencies: {
          select: {
            dependsOnId: true,
            dependsOn: { select: { id: true, title: true, status: true } },
          },
        },
      },
    });
    return ok({
      tasks: tasks.map((task) => ({
        ...task,
        dependencyIds: task.dependencies.map((dep) => dep.dependsOnId),
        dependencies: task.dependencies
          .map((dep) => dep.dependsOn)
          .filter(
            (
              dep,
            ): dep is { id: string; title: string; status: keyof typeof TASK_STATUS } =>
              Boolean(dep),
          ),
      })),
    });
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
  const {
    title,
    description,
    points,
    urgency,
    risk,
    status,
    dueDate,
    assigneeId,
      tags,
      dependencyIds,
    } = body;
    if (!title || points === undefined || points === null) {
      return badRequest("title and points are required");
    }
    if (badPoints(points)) {
      return badRequest("points must be one of 1,2,3,5,8,13,21,34");
    }
    const workspaceId = await resolveWorkspaceId(userId);
    if (!workspaceId) {
      return badRequest("workspace is required");
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
    const statusValue = Object.values(TASK_STATUS).includes(status)
      ? status
      : TASK_STATUS.BACKLOG;
    if (
      statusValue !== TASK_STATUS.BACKLOG &&
      allowedDependencies.some((dep) => dep.status !== TASK_STATUS.DONE)
    ) {
      return badRequest("dependencies must be done before moving to sprint");
    }
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
        dueDate: dueDate ? new Date(dueDate) : null,
        tags: Array.isArray(tags) ? tags.map((tag: string) => String(tag)) : [],
        sprint: activeSprint ? { connect: { id: activeSprint.id } } : undefined,
        assignee: safeAssigneeId ? { connect: { id: safeAssigneeId } } : undefined,
        user: { connect: { id: userId } },
        workspace: { connect: { id: workspaceId } },
      },
    });
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
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    console.error("POST /api/tasks error", error);
    return serverError("failed to create task");
  }
}
