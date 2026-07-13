import { describe, expect, it, vi } from "vitest";
import {
  automationHealthThresholdsFromEnv,
  createHealthQuery,
  type HealthQueryPort,
} from "./health-query";

const snapshot = (overrides: Partial<Awaited<ReturnType<HealthQueryPort["load"]>>> = {}) => ({
  databaseReachable: true,
  automation: {
    pending: 0,
    running: 0,
    failed: 0,
    stalePending: 0,
    staleRunning: 0,
    oldestPendingAt: null,
    oldestRunningAt: null,
  },
  ...overrides,
});

describe("system health query", () => {
  it("marks old pending or running automation as degraded", async () => {
    const port: HealthQueryPort = {
      load: vi.fn().mockResolvedValue(
        snapshot({
          automation: {
            ...snapshot().automation,
            pending: 1,
            stalePending: 1,
          },
        }),
      ),
    };

    await expect(
      createHealthQuery(port, { pendingStaleMs: 1_000, runningStaleMs: 2_000 })(),
    ).resolves.toMatchObject({ status: "degraded" });
    expect(port.load).toHaveBeenCalledWith({ pendingStaleMs: 1_000, runningStaleMs: 2_000 });
  });

  it("reads positive thresholds from the environment and rejects invalid values", () => {
    expect(
      automationHealthThresholdsFromEnv({
        AUTOMATION_PENDING_STALE_MS: "1500",
        AUTOMATION_RUNNING_STALE_MS: "invalid",
      }),
    ).toEqual({ pendingStaleMs: 1_500, runningStaleMs: 300_000 });
  });
});
