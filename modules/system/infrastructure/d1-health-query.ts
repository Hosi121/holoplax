import db from "../../../lib/db";
import type { HealthQueryPort } from "../application/health-query";

export const d1HealthQueryPort: HealthQueryPort = {
  async load(thresholds) {
    try {
      const now = new Date();
      const pendingCutoff = new Date(now.getTime() - thresholds.pendingStaleMs);
      const runningCutoff = new Date(now.getTime() - thresholds.runningStaleMs);
      const [
        ,
        groups,
        oldestPending,
        oldestRunning,
        stalePending,
        staleRunning,
        delegationGroups,
        oldestDelegationPending,
        oldestDelegationRunning,
        staleDelegationPending,
        staleDelegationRunning,
      ] = await Promise.all([
        db.query("SELECT 1 AS reachable"),
        db.taskAutomationJob.groupBy({ by: ["status"], _count: { _all: true } }),
        db.taskAutomationJob.findFirst({
          where: { status: "PENDING" },
          orderBy: { availableAt: "asc" },
          select: { availableAt: true },
        }),
        db.taskAutomationJob.findFirst({
          where: { status: "RUNNING" },
          orderBy: { lockedAt: "asc" },
          select: { lockedAt: true },
        }),
        db.taskAutomationJob.count({
          where: { status: "PENDING", availableAt: { lt: pendingCutoff } },
        }),
        db.taskAutomationJob.count({
          where: { status: "RUNNING", lockedAt: { lt: runningCutoff } },
        }),
        db.delegationJob.groupBy({ by: ["status"], _count: { _all: true } }),
        db.delegationJob.findFirst({
          where: { status: "PENDING" },
          orderBy: { availableAt: "asc" },
          select: { availableAt: true },
        }),
        db.delegationJob.findFirst({
          where: { status: "RUNNING" },
          orderBy: { lockedAt: "asc" },
          select: { lockedAt: true },
        }),
        db.delegationJob.count({
          where: { status: "PENDING", availableAt: { lt: pendingCutoff } },
        }),
        db.delegationJob.count({
          where: { status: "RUNNING", lockedAt: { lt: runningCutoff } },
        }),
      ]);
      const counts = Object.fromEntries(groups.map(({ status, _count }) => [status, _count._all]));
      const delegationCounts = Object.fromEntries(
        delegationGroups.map(({ status, _count }) => [status, _count._all]),
      );
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
        delegation: {
          pending: delegationCounts.PENDING ?? 0,
          running: delegationCounts.RUNNING ?? 0,
          failed: delegationCounts.FAILED ?? 0,
          stalePending: staleDelegationPending,
          staleRunning: staleDelegationRunning,
          oldestPendingAt: oldestDelegationPending?.availableAt ?? null,
          oldestRunningAt: oldestDelegationRunning?.lockedAt ?? null,
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
        delegation: {
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
