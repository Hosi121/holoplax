import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    intakeItem: { findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    task: { create: vi.fn(), findUnique: vi.fn() },
    workspaceMember: { findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
    taskWorkflowEvent: { create: vi.fn() },
    $executeRaw: vi.fn(),
  };
  return {
    tx,
    transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    enqueueAutomation: vi.fn(),
    drainAutomation: vi.fn(),
  };
});

vi.mock("../prisma", () => ({
  default: {
    $transaction: mocks.transaction,
  },
}));
vi.mock("../../modules/tasks/infrastructure/prisma-task-automation-jobs", () => ({
  enqueueTaskAutomation: mocks.enqueueAutomation,
  drainTaskAutomationForWorkspace: mocks.drainAutomation,
  processTaskAutomationJobs: mocks.drainAutomation,
}));

import { resolveIntakeItem } from "../../modules/intake/index.server";

const intakeItem = {
  id: "intake-1",
  userId: "user-1",
  workspaceId: "workspace-1",
  title: "Captured task",
  body: "Details",
  status: "PENDING",
};

describe("intake application service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tx.intakeItem.findUnique.mockResolvedValue(intakeItem);
    mocks.tx.workspaceMember.findUnique.mockResolvedValue({ workspaceId: "workspace-1" });
    mocks.tx.auditLog.create.mockResolvedValue({ id: "audit-1" });
    mocks.tx.taskWorkflowEvent.create.mockResolvedValue({ id: "workflow-event-1" });
    mocks.enqueueAutomation.mockResolvedValue(undefined);
    mocks.drainAutomation.mockResolvedValue({ processed: 1, succeeded: 1, failed: 0 });
    mocks.tx.task.findUnique.mockResolvedValue({
      createdAt: new Date(),
      dueDate: null,
      points: 3,
      userId: "user-1",
    });
  });

  it("claims an intake item and creates a task with its initial status event atomically", async () => {
    mocks.tx.intakeItem.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.task.create.mockResolvedValue({
      id: "task-1",
      title: intakeItem.title,
      description: intakeItem.body,
      points: 3,
      status: "BACKLOG",
      workflowState: "READY",
      updatedAt: new Date(),
    });
    mocks.tx.intakeItem.update.mockResolvedValue({ count: 1 });

    await expect(
      resolveIntakeItem(
        { userId: "user-1" },
        { intakeId: "intake-1", action: "create", workspaceId: "workspace-1" },
      ),
    ).resolves.toEqual({ taskId: "task-1" });

    expect(mocks.tx.task.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        statusEvents: {
          create: expect.objectContaining({ toStatus: "BACKLOG", trigger: "API" }),
        },
      }),
    });
    expect(mocks.enqueueAutomation).toHaveBeenCalledOnce();
    expect(mocks.drainAutomation).toHaveBeenCalledOnce();
  });

  it("does not create a second task after the intake item was already claimed", async () => {
    mocks.tx.intakeItem.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      resolveIntakeItem(
        { userId: "user-1" },
        { intakeId: "intake-1", action: "create", workspaceId: "workspace-1" },
      ),
    ).rejects.toMatchObject({ code: "INTAKE_CONFLICT", kind: "conflict" });
    expect(mocks.tx.task.create).not.toHaveBeenCalled();
    expect(mocks.enqueueAutomation).not.toHaveBeenCalled();
  });

  it("cannot dismiss an item after another resolution won", async () => {
    mocks.tx.intakeItem.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      resolveIntakeItem({ userId: "user-1" }, { intakeId: "intake-1", action: "dismiss" }),
    ).rejects.toMatchObject({ code: "INTAKE_CONFLICT", kind: "conflict" });
  });
});
