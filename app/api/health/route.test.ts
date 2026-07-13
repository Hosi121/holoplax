import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getSystemHealth: vi.fn() }));

vi.mock("../../../modules/system/index.server", () => ({
  getSystemHealth: mocks.getSystemHealth,
}));

import { GET } from "./route";

describe("GET /api/health", () => {
  beforeEach(() => vi.clearAllMocks());

  it("exposes stale automation as degraded instead of false-green", async () => {
    mocks.getSystemHealth.mockResolvedValue({
      status: "degraded",
      databaseReachable: true,
      automation: {
        pending: 1,
        running: 0,
        failed: 0,
        stalePending: 1,
        staleRunning: 0,
        oldestPendingAt: new Date("2026-07-13T00:00:00Z"),
        oldestRunningAt: null,
      },
    });

    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "degraded",
      automation: { stalePending: 1, oldestPendingAt: "2026-07-13T00:00:00.000Z" },
    });
  });
});
