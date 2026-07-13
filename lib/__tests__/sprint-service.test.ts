import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    sprint: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    task: {
      updateMany: vi.fn(),
      findMany: vi.fn(),
    },
    sprintItem: { aggregate: vi.fn(), updateMany: vi.fn(), createMany: vi.fn() },
    velocityEntry: { create: vi.fn() },
    taskStatusEvent: { createMany: vi.fn() },
    auditLog: { create: vi.fn(), createMany: vi.fn() },
  };
  return {
    tx,
    sprintFindMany: vi.fn(),
    transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
  };
});

vi.mock("../prisma", () => ({
  default: {
    sprint: {
      findMany: mocks.sprintFindMany,
    },
    $transaction: mocks.transaction,
  },
}));

import { closeCurrentSprint, createSprint, listSprints } from "../../modules/sprints/index.server";

const closedSprint = {
  id: "sprint-1",
  name: "Sprint 1",
  status: "CLOSED",
  capacityPoints: 24,
  startedAt: new Date("2026-07-01T00:00:00Z"),
  plannedEndAt: null,
  endedAt: new Date("2026-07-13T00:00:00Z"),
};

describe("sprint application service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tx.auditLog.create.mockResolvedValue({ id: "audit-1" });
    mocks.tx.auditLog.createMany.mockResolvedValue({ count: 2 });
  });

  it("computes sprint summaries in one query", async () => {
    mocks.sprintFindMany.mockResolvedValue([
      {
        ...closedSprint,
        items: [
          { outcome: "COMPLETED", committedPoints: 5, removedAt: null },
          { outcome: "CARRYOVER", committedPoints: 3, removedAt: new Date() },
        ],
      },
    ]);

    await expect(listSprints("workspace-1")).resolves.toEqual([
      expect.objectContaining({ committedPoints: 8, activePoints: 5, completedPoints: 5 }),
    ]);
    expect(mocks.sprintFindMany).toHaveBeenCalledTimes(1);
  });

  it("closes, projects velocity, and resets tasks in one transaction", async () => {
    mocks.tx.sprint.findFirst.mockResolvedValue({ id: "sprint-1" });
    mocks.tx.sprint.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.sprint.findUniqueOrThrow.mockResolvedValue(closedSprint);
    mocks.tx.sprintItem.aggregate.mockResolvedValue({ _sum: { committedPoints: 8 } });
    mocks.tx.sprintItem.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.task.findMany.mockResolvedValue([{ id: "task-1" }]);
    mocks.tx.task.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.velocityEntry.create.mockResolvedValue({ id: "velocity-1" });
    mocks.tx.taskStatusEvent.createMany.mockResolvedValue({ count: 1 });

    await expect(
      closeCurrentSprint({ userId: "user-1", workspaceId: "workspace-1" }),
    ).resolves.toEqual(closedSprint);

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.tx.velocityEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ sprintId: "sprint-1", points: 8, range: "6-10" }),
    });
    expect(mocks.tx.taskStatusEvent.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ trigger: "SPRINT_END", taskId: "task-1" })],
    });
    expect(mocks.tx.auditLog.createMany).toHaveBeenCalledTimes(1);
  });

  it("does not create duplicate velocity when another close wins", async () => {
    mocks.tx.sprint.findFirst.mockResolvedValue({ id: "sprint-1" });
    mocks.tx.sprint.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      closeCurrentSprint({ userId: "user-1", workspaceId: "workspace-1" }),
    ).rejects.toMatchObject({ code: "SPRINT_CONFLICT", kind: "conflict" });
    expect(mocks.tx.velocityEntry.create).not.toHaveBeenCalled();
    expect(mocks.tx.auditLog.createMany).not.toHaveBeenCalled();
  });

  it("requires the active sprint to be closed through the normal projection path", async () => {
    mocks.tx.sprint.findFirst.mockResolvedValue({ id: "sprint-1" });

    await expect(
      createSprint({ userId: "user-1", workspaceId: "workspace-1" }),
    ).rejects.toMatchObject({ code: "SPRINT_CONFLICT", kind: "conflict" });
    expect(mocks.transaction).toHaveBeenCalledOnce();
  });
});
