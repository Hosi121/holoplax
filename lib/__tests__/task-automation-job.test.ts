import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const taskAutomationJob = {
    findFirst: vi.fn(),
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
} from "../../modules/tasks/infrastructure/prisma-task-automation-jobs";

describe("durable task automation jobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.taskAutomationJob.updateMany.mockResolvedValue({ count: 1 });
  });

  it("uses the task revision as an idempotency key", async () => {
    const upsert = vi.fn().mockResolvedValue({ id: "job-1" });
    const tx = { taskAutomationJob: { upsert } };
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
    };
    mocks.db.taskAutomationJob.findFirst.mockResolvedValueOnce(job).mockResolvedValueOnce(null);
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
      });
    mocks.applyAutomation.mockRejectedValue(new Error("provider unavailable"));

    await expect(processTaskAutomationJobs({ limit: 1 })).resolves.toEqual({
      processed: 1,
      succeeded: 0,
      failed: 1,
    });

    expect(mocks.db.taskAutomationJob.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: "job-1", status: "RUNNING" },
        data: expect.objectContaining({ status: "PENDING", lastError: "provider unavailable" }),
      }),
    );
  });
});
