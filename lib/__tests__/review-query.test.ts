import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sprintFindFirst: vi.fn(),
  taskCount: vi.fn(),
  dependencyCount: vi.fn(),
  velocityFindMany: vi.fn(),
  statusFindMany: vi.fn(),
  automationFindUnique: vi.fn(),
  queryRaw: vi.fn(),
}));

vi.mock("../prisma", () => ({
  default: {
    sprint: { findFirst: mocks.sprintFindFirst },
    task: { count: mocks.taskCount },
    taskDependency: { count: mocks.dependencyCount },
    velocityEntry: { findMany: mocks.velocityFindMany },
    taskStatusEvent: { findMany: mocks.statusFindMany },
    userAutomationSetting: { findUnique: mocks.automationFindUnique },
    $queryRaw: mocks.queryRaw,
  },
}));

import { prismaReviewQueryPort } from "../../modules/review/infrastructure/prisma-review-query";

describe("review query", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sprintFindFirst.mockResolvedValue(null);
    mocks.taskCount.mockResolvedValue(0);
    mocks.dependencyCount.mockResolvedValue(0);
    mocks.velocityFindMany.mockResolvedValue([]);
    mocks.statusFindMany.mockResolvedValue([]);
    mocks.automationFindUnique.mockResolvedValue(null);
    mocks.queryRaw.mockResolvedValue([{ averageDays: null }]);
  });

  it("excludes canceled work from active backlog KPIs", async () => {
    await prismaReviewQueryPort.load("user-1", "workspace-1", new Date());

    for (const call of mocks.taskCount.mock.calls) {
      expect(call[0].where).toMatchObject({
        workspaceId: "workspace-1",
        sprintId: null,
        workflowState: { notIn: ["DONE", "CANCELED"] },
      });
    }
    expect(mocks.dependencyCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          task: { workspaceId: "workspace-1", workflowState: { not: "CANCELED" } },
        }),
      }),
    );
  });
});
