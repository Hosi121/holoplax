import { requireWorkspaceAuth } from "../../../lib/api-guards";
import { withApiHandler } from "../../../lib/api-handler";
import { ok } from "../../../lib/api-response";
import prisma from "../../../lib/prisma";

export async function GET() {
  return withApiHandler(
    {
      logLabel: "GET /api/velocity",
      errorFallback: {
        code: "VELOCITY_INTERNAL",
        message: "failed to load velocity",
        status: 500,
      },
    },
    async () => {
      const { workspaceId } = await requireWorkspaceAuth();
      if (!workspaceId) {
        return ok({ velocity: [] });
      }
      // Fetch the most recent 20 entries. This is enough for the chart and
      // far more than the 7 used for stats; it avoids a full-table scan on
      // workspaces that have accumulated hundreds of velocity records.
      const velocity = await prisma.velocityEntry.findMany({
        where: { workspaceId },
        orderBy: { createdAt: "desc" },
        take: 20,
      });
      // Use the last 7 entries for summary stats (velocity is most meaningful
      // over a short recent window).
      const targetCount = 7;
      const recent = velocity.slice(0, targetCount).map((entry) => entry.points);
      const avg =
        recent.length > 0 ? recent.reduce((sum, value) => sum + value, 0) / recent.length : 0;
      const variance =
        recent.length > 0
          ? recent.reduce((sum, value) => sum + (value - avg) ** 2, 0) / recent.length
          : 0;
      const stdDev = Math.sqrt(variance);

      const sprints = await prisma.sprint.findMany({
        where: { workspaceId, status: "CLOSED" },
        orderBy: { endedAt: "desc" },
        take: 3,
      });
      const sprintIds = sprints.map((sprint) => sprint.id);
      const pbiTasks = sprintIds.length
        ? await prisma.task.findMany({
            where: { workspaceId, sprintId: { in: sprintIds }, type: "PBI" },
            select: { sprintId: true, status: true, points: true },
          })
        : [];
      const latestSprintId = sprints[0]?.id ?? null;
      const latestPbiTasks = latestSprintId
        ? pbiTasks.filter((task) => task.sprintId === latestSprintId)
        : [];
      const pbiDone = latestPbiTasks.filter((task) => task.status === "DONE");
      const pbiDonePoints = pbiDone.reduce((sum, task) => sum + task.points, 0);
      const pbiCompletionRate =
        latestPbiTasks.length > 0 ? pbiDone.length / latestPbiTasks.length : 0;

      return ok({
        velocity,
        summary: {
          avg,
          variance,
          stdDev,
          stableRange: avg
            ? `${Math.max(0, avg - stdDev).toFixed(1)}-${(avg + stdDev).toFixed(1)}`
            : null,
        },
        pbi: {
          sprintId: latestSprintId,
          doneCount: pbiDone.length,
          donePoints: pbiDonePoints,
          totalCount: latestPbiTasks.length,
          completionRate: pbiCompletionRate,
        },
      });
    },
  );
}
