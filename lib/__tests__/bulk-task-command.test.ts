import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    task: { findMany: vi.fn(), updateMany: vi.fn() },
    routineRule: { findUnique: vi.fn() },
    taskStatusEvent: { createMany: vi.fn() },
    taskWorkflowEvent: { create: vi.fn() },
    sprintItem: { updateMany: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return {
    tx,
    transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    runAutomation: vi.fn(),
  };
});

vi.mock("../prisma", () => ({
  default: { $transaction: mocks.transaction },
}));

vi.mock("../../modules/automation/index.server", () => ({
  runTaskAutomation: mocks.runAutomation,
}));

import { prismaBulkTaskCommandPort } from "../../modules/tasks/infrastructure/prisma-bulk-task-command";

describe("bulk task commands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tx.task.findMany.mockResolvedValue([
      {
        id: "task-1",
        title: "Task",
        description: "",
        points: 3,
        status: "SPRINT",
        workflowState: "READY",
        sprintId: "sprint-1",
        type: "TASK",
        checklist: null,
        children: [],
        routineRule: null,
        dependencies: [],
      },
    ]);
    mocks.tx.task.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.routineRule.findUnique.mockResolvedValue(null);
    mocks.tx.taskStatusEvent.createMany.mockResolvedValue({ count: 1 });
    mocks.tx.taskWorkflowEvent.create.mockResolvedValue({ id: "workflow-1" });
    mocks.tx.sprintItem.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.auditLog.create.mockResolvedValue({ id: "audit-1" });
  });

  it("retains sprint membership when tasks are completed in bulk", async () => {
    await prismaBulkTaskCommandPort.execute(
      { userId: "user-1", workspaceId: "workspace-1" },
      { action: "status", taskIds: ["task-1"], status: "DONE" },
    );

    expect(mocks.tx.task.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["task-1"] }, workspaceId: "workspace-1" },
      data: { status: "DONE", workflowState: "DONE" },
    });
    expect(mocks.tx.sprintItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ outcome: "COMPLETED" }),
      }),
    );
  });
});
