import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    task: { findMany: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
    routineRule: { findUnique: vi.fn() },
    taskStatusEvent: { createMany: vi.fn() },
    taskWorkflowEvent: { create: vi.fn() },
    sprintItem: { updateMany: vi.fn(), findUnique: vi.fn() },
    sprintItemEvent: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  return {
    tx,
    transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    enqueueAutomation: vi.fn(),
    wakeAutomation: vi.fn(),
  };
});

vi.mock("../prisma", () => ({
  default: { $transaction: mocks.transaction },
}));

vi.mock("../../modules/tasks/infrastructure/prisma-task-automation-jobs", () => ({
  enqueueTaskAutomation: mocks.enqueueAutomation,
  wakeTaskAutomationWorker: mocks.wakeAutomation,
}));

import { createBulkTaskCommand } from "../../modules/tasks/application/bulk-task-command";
import { prismaBulkTaskCommandPort } from "../../modules/tasks/infrastructure/prisma-bulk-task-command";

const executeBulkTaskCommand = createBulkTaskCommand(prismaBulkTaskCommandPort);

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
        updatedAt: new Date("2026-07-13T00:00:00Z"),
      },
    ]);
    mocks.tx.task.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.task.findUnique.mockResolvedValue({
      createdAt: new Date(),
      dueDate: null,
      points: 3,
      userId: "user-1",
    });
    mocks.tx.routineRule.findUnique.mockResolvedValue(null);
    mocks.tx.taskStatusEvent.createMany.mockResolvedValue({ count: 1 });
    mocks.tx.taskWorkflowEvent.create.mockResolvedValue({ id: "workflow-1" });
    mocks.tx.sprintItem.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.sprintItem.findUnique.mockResolvedValue({
      id: "item-1",
      taskTitle: "Task",
      taskType: "TASK",
      committedPoints: 3,
      removedAt: null,
      outcome: "COMMITTED",
    });
    mocks.tx.sprintItemEvent.create.mockResolvedValue({ id: "item-event-1" });
    mocks.tx.auditLog.create.mockResolvedValue({ id: "audit-1" });
  });

  it("retains sprint membership when tasks are completed in bulk", async () => {
    await executeBulkTaskCommand(
      { userId: "user-1", workspaceId: "workspace-1" },
      { action: "status", taskIds: ["task-1"], status: "DONE" },
    );

    expect(mocks.tx.task.updateMany).toHaveBeenCalledWith({
      where: { id: "task-1", workspaceId: "workspace-1" },
      data: { status: "DONE", workflowState: "DONE" },
    });
    expect(mocks.tx.sprintItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ outcome: "COMPLETED" }),
      }),
    );
    expect(mocks.wakeAutomation).toHaveBeenCalledOnce();
  });

  it("queues points automation with the revision actually written by the database", async () => {
    const storedRevision = new Date("2026-07-13T01:23:45Z");
    mocks.tx.task.findMany
      .mockResolvedValueOnce([
        {
          id: "task-1",
          title: "Task",
          description: "",
          points: 3,
          status: "BACKLOG",
          workflowState: "READY",
          sprintId: null,
          type: "TASK",
          checklist: null,
          children: [],
          routineRule: null,
          dependencies: [],
          automationStatus: "NONE",
          hierarchyRole: "STANDARD",
          updatedAt: new Date("2026-07-13T00:00:00Z"),
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "task-1",
          title: "Task",
          description: "",
          points: 5,
          status: "BACKLOG",
          workflowState: "READY",
          updatedAt: storedRevision,
        },
      ]);

    await executeBulkTaskCommand(
      { userId: "user-1", workspaceId: "workspace-1" },
      { action: "points", taskIds: ["task-1"], points: 5 },
    );

    expect(mocks.enqueueAutomation).toHaveBeenCalledWith(
      mocks.tx,
      expect.objectContaining({ task: expect.objectContaining({ updatedAt: storedRevision }) }),
    );
  });
});
