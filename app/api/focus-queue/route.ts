import { requireWorkspaceAuth } from "../../../lib/api-guards";
import { withApiHandler } from "../../../lib/api-handler";
import { ok } from "../../../lib/api-response";
import prisma from "../../../lib/prisma";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export async function GET() {
  return withApiHandler(
    {
      logLabel: "GET /api/focus-queue",
      errorFallback: {
        code: "FOCUS_QUEUE_INTERNAL",
        message: "failed to load focus queue",
        status: 500,
      },
    },
    async () => {
      const { workspaceId } = await requireWorkspaceAuth();
      if (!workspaceId) {
        return ok({ items: [], computedAt: null });
      }

      // Load candidate tasks. We cap at 200 rows to prevent full-table scans
      // on large workspaces. Tasks are ordered by points (desc) so that
      // high-value items are never missed when the cap is hit; due-date urgency
      // is then re-ranked in memory using the composite priority score.
      const tasks = await prisma.task.findMany({
        where: { workspaceId, status: { not: "DONE" } },
        orderBy: [{ points: "desc" }, { dueDate: "asc" }],
        take: 200,
        select: {
          id: true,
          title: true,
          points: true,
          dueDate: true,
        },
      });
      const now = new Date();
      const scored = tasks
        .map((task) => {
          const baseScore = task.points * 9;
          const dueDate = task.dueDate ? new Date(task.dueDate) : null;
          const dueScore = (() => {
            if (!dueDate) return 0;
            const daysLeft = (dueDate.getTime() - now.getTime()) / MS_PER_DAY;
            const clamped = Math.min(14, Math.max(0, daysLeft));
            return Math.max(0, Math.min(100, 100 * (1 - clamped / 14)));
          })();
          const priority = baseScore * 0.7 + dueScore * 0.3;
          const reason = dueScore >= 50 ? "期限が近い" : "高スコア";
          return {
            taskId: task.id,
            title: task.title,
            dueDate: dueDate ? dueDate.toISOString() : null,
            priorityScore: priority,
            dueScore,
            reason,
          };
        })
        .sort((a, b) => b.priorityScore - a.priorityScore)
        .slice(0, 3);

      return ok({
        items: scored,
        computedAt: new Date().toISOString(),
      });
    },
  );
}
