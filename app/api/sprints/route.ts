import { requireAuth } from "../../../lib/api-auth";
import { handleAuthError, ok } from "../../../lib/api-response";
import { errorResponse } from "../../../lib/http/errors";
import prisma from "../../../lib/prisma";
import { resolveWorkspaceId } from "../../../lib/workspace-context";

export async function GET() {
  try {
    const { userId } = await requireAuth();
    const workspaceId = await resolveWorkspaceId(userId);
    if (!workspaceId) {
      return ok({ sprints: [] });
    }
    const sprints = await prisma.sprint.findMany({
      where: { workspaceId },
      orderBy: { startedAt: "desc" },
    });
    const sprintIds = sprints.map((sprint) => sprint.id);
    const tasks = sprintIds.length
      ? await prisma.task.findMany({
          where: { sprintId: { in: sprintIds } },
          select: { sprintId: true, status: true, points: true },
        })
      : [];
    const bySprint = tasks.reduce<Record<string, { committed: number; completed: number }>>(
      (acc, task) => {
        if (!task.sprintId) return acc;
        if (!acc[task.sprintId]) acc[task.sprintId] = { committed: 0, completed: 0 };
        acc[task.sprintId].committed += task.points;
        if (task.status === "DONE") acc[task.sprintId].completed += task.points;
        return acc;
      },
      {},
    );

    return ok({
      sprints: sprints.map((sprint) => ({
        ...sprint,
        committedPoints: bySprint[sprint.id]?.committed ?? 0,
        completedPoints: bySprint[sprint.id]?.completed ?? 0,
      })),
    });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    console.error("GET /api/sprints error", error);
    return errorResponse(error, {
      code: "SPRINT_INTERNAL",
      message: "failed to load sprints",
      status: 500,
    });
  }
}
