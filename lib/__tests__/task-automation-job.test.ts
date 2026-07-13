import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const taskAutomationJob = {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    groupBy: vi.fn(),
    updateMany: vi.fn(),
  };
  const db = {
    taskAutomationJob,
    task: { findFirst: vi.fn(), updateMany: vi.fn() },
    aiPrepOutput: { count: vi.fn() },
    aiSuggestion: { count: vi.fn() },
  };
  return {
    db,
    transaction: vi.fn(async (callback: (tx: typeof db) => Promise<unknown>) => callback(db)),
    applyAutomation: vi.fn(),
  };
});

vi.mock("../prisma", () => ({
  default: { ...mocks.db, $transaction: mocks.transaction },
}));

vi.mock("../logger", () => ({
  logger: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock("../../modules/tasks/infrastructure/prisma-task-automation", () => ({
  applyAutomationForTask: mocks.applyAutomation,
}));

import {
  enqueueTaskAutomation,
  processTaskAutomationJobs,
  retryFailedTaskAutomationJobs,
} from "../../modules/tasks/infrastructure/prisma-task-automation-jobs";

describe("durable task automation jobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.taskAutomationJob.updateMany.mockResolvedValue({ count: 1 });
  });

  it("uses the task revision as an idempotency key", async () => {
    const upsert = vi.fn().mockResolvedValue({ id: "job-1" });
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const tx = { taskAutomationJob: { upsert, updateMany } };
    const updatedAt = new Date("2026-07-13T00:00:00Z");

    await enqueueTaskAutomation(tx as never, {
      task: {
        id: "task-1",
        title: "Task",
        description: "",
        points: 3,
        status: "BACKLOG",
        workflowState: "READY",
        updatedAt,
      },
      workspaceId: "workspace-1",
      requestedById: "user-1",
    });

    expect(upsert).toHaveBeenCalledWith({
      where: { dedupeKey: `task-1:${updatedAt.toISOString()}` },
      create: expect.objectContaining({ taskKey: "task-1", requestedById: "user-1" }),
      update: {},
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        taskId: "task-1",
        status: "PENDING",
        dedupeKey: { not: `task-1:${updatedAt.toISOString()}` },
      },
      data: { status: "CANCELED" },
    });
  });

  it("keeps a failed provider call pending for retry", async () => {
    const job = {
      id: "job-1",
      taskId: "task-1",
      taskKey: "task-1",
      workspaceId: "workspace-1",
      requestedById: "user-1",
      status: "PENDING",
      attempts: 0,
      createdAt: new Date(),
      dedupeKey: "task-1:2026-07-13T00:00:00.000Z",
    };
    mocks.db.taskAutomationJob.findFirst.mockResolvedValueOnce(job);
    mocks.db.task.findFirst
      .mockResolvedValueOnce({ automationStatus: "NONE", hierarchyRole: "STANDARD" })
      .mockResolvedValueOnce({
        id: "task-1",
        title: "Task",
        description: "",
        points: 3,
        status: "BACKLOG",
        workflowState: "READY",
        userId: "user-1",
        updatedAt: new Date("2026-07-13T00:00:00.000Z"),
      });
    mocks.applyAutomation.mockRejectedValue(new Error("provider unavailable"));

    await expect(processTaskAutomationJobs({ limit: 1 })).resolves.toEqual({
      processed: 1,
      succeeded: 0,
      failed: 1,
    });

    expect(mocks.db.taskAutomationJob.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: "job-1", status: "RUNNING", lockedBy: expect.any(String) },
        data: expect.objectContaining({ status: "PENDING", lastError: "provider unavailable" }),
      }),
    );
  });

  it("cancels a queued revision after the task has changed", async () => {
    const job = {
      id: "job-stale",
      taskId: "task-1",
      taskKey: "task-1",
      workspaceId: "workspace-1",
      requestedById: "user-1",
      status: "PENDING",
      attempts: 0,
      createdAt: new Date(),
      dedupeKey: "task-1:2026-07-12T00:00:00.000Z",
    };
    mocks.db.taskAutomationJob.findFirst.mockResolvedValueOnce(job);
    mocks.db.task.findFirst
      .mockResolvedValueOnce({ automationStatus: "NONE", hierarchyRole: "STANDARD" })
      .mockResolvedValueOnce({
        id: "task-1",
        title: "Changed task",
        description: "",
        points: 3,
        status: "BACKLOG",
        workflowState: "READY",
        userId: "user-1",
        updatedAt: new Date("2026-07-13T00:00:00.000Z"),
      });

    await expect(processTaskAutomationJobs({ limit: 1 })).resolves.toEqual({
      processed: 1,
      succeeded: 0,
      failed: 0,
    });
    expect(mocks.applyAutomation).not.toHaveBeenCalled();
    expect(mocks.db.taskAutomationJob.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: "job-stale", status: "RUNNING", lockedBy: expect.any(String) },
        data: { status: "CANCELED", lockedAt: null, lockedBy: null },
      }),
    );
  });

  it("requeues terminal failures only through the explicit recovery operation", async () => {
    mocks.db.taskAutomationJob.findMany.mockResolvedValue([{ id: "job-1" }, { id: "job-2" }]);
    mocks.db.taskAutomationJob.updateMany.mockResolvedValue({ count: 2 });

    await expect(retryFailedTaskAutomationJobs(2)).resolves.toBe(2);

    expect(mocks.db.taskAutomationJob.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["job-1", "job-2"] }, status: "FAILED" },
      data: expect.objectContaining({
        status: "PENDING",
        attempts: 0,
        lockedAt: null,
        lockedBy: null,
        lastError: null,
      }),
    });
  });
});
