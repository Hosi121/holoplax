import type { SprintStatus } from "@prisma/client";
import { requireWorkspaceAuth } from "../../../lib/api-guards";
import { withApiHandler } from "../../../lib/api-handler";
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
      // Limit defaults to 20 (enough for the history view). Callers may pass
      // ?limit=N (capped at 100) to fetch more, or ?limit=0 for unlimited.
      const limitParam = searchParams.get("limit");
      const parsedLimit = limitParam !== null ? Number.parseInt(limitParam, 10) : 20;
      const take =
        Number.isNaN(parsedLimit) || parsedLimit <= 0 ? undefined : Math.min(parsedLimit, 100);
      // Single query with include to fetch sprints and tasks together
      const sprints = await prisma.sprint.findMany({
        where: { workspaceId, ...(status ? { status } : {}) },
        orderBy: { startedAt: "desc" },
        ...(take !== undefined ? { take } : {}),
        include: {
          tasks: {
            select: { status: true, points: true },
          },
        },
      });

      return ok({
        sprints: sprints.map(({ tasks, ...sprint }) => {
          let committed = 0;
          let completed = 0;
          for (const task of tasks) {
            committed += task.points;
            if (task.status === "DONE") completed += task.points;
          }
          return {
            ...sprint,
            committedPoints: committed,
            completedPoints: completed,
          };
        }),
      });
    },
  );
}
