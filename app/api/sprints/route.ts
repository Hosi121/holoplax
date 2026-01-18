import { SprintStatus } from "@prisma/client";
import { withApiHandler } from "../../../lib/api-handler";
import { requireWorkspaceAuth } from "../../../lib/api-guards";
import { ok } from "../../../lib/api-response";
import prisma from "../../../lib/prisma";

export async function GET(request: Request) {
  return withApiHandler(
    {
      logLabel: "GET /api/sprints",
      errorFallback: {
        code: "SPRINT_INTERNAL",
        message: "failed to load sprints",
        status: 500,
      },
    },
    async () => {
      const { workspaceId } = await requireWorkspaceAuth();
      if (!workspaceId) {
        return ok({ sprints: [] });
      }
      const { searchParams } = new URL(request.url);
      const statusParam = searchParams.get("status");
      const status = statusParam as SprintStatus | null;
      const sprints = await prisma.sprint.findMany({
        where: { workspaceId, ...(status ? { status } : {}) },
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
    },
  );
}
