export type QueueHealthSnapshot = {
  pending: number;
  running: number;
  failed: number;
  stalePending: number;
  staleRunning: number;
  oldestPendingAt: Date | null;
  oldestRunningAt: Date | null;
};

export type SystemHealthSnapshot = {
  status: "healthy" | "degraded" | "unhealthy";
  databaseReachable: boolean;
  automation: QueueHealthSnapshot;
  delegation: QueueHealthSnapshot;
};

export type AutomationHealthThresholds = {
  pendingStaleMs: number;
  runningStaleMs: number;
};

export const DEFAULT_AUTOMATION_HEALTH_THRESHOLDS: AutomationHealthThresholds = {
  pendingStaleMs: 2 * 60 * 1000,
  runningStaleMs: 5 * 60 * 1000,
};

const positiveDuration = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : fallback;
};

export const automationHealthThresholdsFromEnv = (
  env: Record<string, string | undefined>,
): AutomationHealthThresholds => ({
  pendingStaleMs: positiveDuration(
    env.AUTOMATION_PENDING_STALE_MS,
    DEFAULT_AUTOMATION_HEALTH_THRESHOLDS.pendingStaleMs,
  ),
  runningStaleMs: positiveDuration(
    env.AUTOMATION_RUNNING_STALE_MS,
    DEFAULT_AUTOMATION_HEALTH_THRESHOLDS.runningStaleMs,
  ),
});

export type HealthQueryData = Omit<SystemHealthSnapshot, "status">;

export interface HealthQueryPort {
  load(thresholds: AutomationHealthThresholds): Promise<HealthQueryData>;
}

export const createHealthQuery =
  (
    port: HealthQueryPort,
    thresholds: AutomationHealthThresholds = DEFAULT_AUTOMATION_HEALTH_THRESHOLDS,
  ) =>
  async (): Promise<SystemHealthSnapshot> => {
    const snapshot = await port.load(thresholds);
    const degraded = [snapshot.automation, snapshot.delegation].some(
      (queue) => queue.failed > 0 || queue.stalePending > 0 || queue.staleRunning > 0,
    );
    return {
      ...snapshot,
      status: snapshot.databaseReachable ? (degraded ? "degraded" : "healthy") : "unhealthy",
    };
  };
