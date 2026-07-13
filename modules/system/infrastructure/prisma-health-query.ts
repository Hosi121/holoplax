import prisma from "../../../lib/prisma";
import type { HealthQueryPort } from "../application/health-query";

export const prismaHealthQueryPort: HealthQueryPort = {
  async load(thresholds) {
    try {
      const now = new Date();
      const pendingCutoff = new Date(now.getTime() - thresholds.pendingStaleMs);
      const runningCutoff = new Date(now.getTime() - thresholds.runningStaleMs);
      const [, groups, oldestPending, oldestRunning, stalePending, staleRunning] =
        await Promise.all([
          prisma.$queryRaw`SELECT 1`,
          prisma.taskAutomationJob.groupBy({ by: ["status"], _count: { _all: true } }),
          prisma.taskAutomationJob.findFirst({
            where: { status: "PENDING" },
            orderBy: { availableAt: "asc" },
            select: { availableAt: true },
          }),
          prisma.taskAutomationJob.findFirst({
            where: { status: "RUNNING" },
            orderBy: { lockedAt: "asc" },
            select: { lockedAt: true },
          }),
          prisma.taskAutomationJob.count({
            where: { status: "PENDING", availableAt: { lt: pendingCutoff } },
          }),
          prisma.taskAutomationJob.count({
            where: { status: "RUNNING", lockedAt: { lt: runningCutoff } },
          }),
        ]);
      const counts = Object.fromEntries(groups.map(({ status, _count }) => [status, _count._all]));
      return {
        databaseReachable: true,
        automation: {
          pending: counts.PENDING ?? 0,
          running: counts.RUNNING ?? 0,
          failed: counts.FAILED ?? 0,
          stalePending,
          staleRunning,
          oldestPendingAt: oldestPending?.availableAt ?? null,
          oldestRunningAt: oldestRunning?.lockedAt ?? null,
        },
      };
    } catch {
      return {
        databaseReachable: false,
        automation: {
          pending: 0,
          running: 0,
          failed: 0,
          stalePending: 0,
          staleRunning: 0,
          oldestPendingAt: null,
          oldestRunningAt: null,
        },
      };
    }
  },
};
