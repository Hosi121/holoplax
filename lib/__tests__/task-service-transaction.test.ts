import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    task: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    workspaceMember: { findUnique: vi.fn() },
    taskDependency: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
      upsert: vi.fn(),
    },
    auditLog: { create: vi.fn() },
    taskStatusEvent: { create: vi.fn() },
    taskWorkflowEvent: { create: vi.fn() },
    routineRule: { update: vi.fn(), create: vi.fn(), delete: vi.fn() },
    routineSeries: { update: vi.fn(), upsert: vi.fn() },
    sprintItem: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    sprintItemEvent: { create: vi.fn(), createMany: vi.fn() },
  };
  return {
    tx,
    outsideTaskRead: vi.fn(),
    transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    enqueue: vi.fn(),
    wake: vi.fn(),
  };
});

vi.mock("../prisma", () => ({
  default: {
    task: { findFirst: mocks.outsideTaskRead },
    $transaction: mocks.transaction,
  },
}));

vi.mock("../logger", () => ({
  logger: { error: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock("../../modules/tasks/infrastructure/prisma-task-automation-jobs", () => ({
  enqueueTaskAutomation: mocks.enqueue,
  wakeTaskAutomationWorker: mocks.wake,
}));

import { updateTask } from "../../modules/tasks/infrastructure/prisma-task-service";

const currentTask = {
  id: "task-1",
  title: "Before",
  description: "",
  definitionOfDone: "",
  checklist: null,
  points: 3,
  urgency: "MEDIUM",
  risk: "MEDIUM",
  status: "BACKLOG",
  workflowState: "READY",
  type: "TASK",
  automationStatus: "NONE",
  hierarchyRole: "STANDARD",
  origin: "MANUAL",
  parentId: null,
  sprintId: null,
  routineSeriesId: null,
  dueDate: null,
  assigneeId: null,
  tags: [],
  userId: "user-1",
  workspaceId: "workspace-1",
  createdAt: new Date("2026-07-01T00:00:00Z"),
  updatedAt: new Date("2026-07-13T00:00:00Z"),
  routineRule: null,
  parent: null,
  children: [],
  sprint: null,
  dependencies: [],
};

describe("task update transaction boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tx.task.findFirst
      .mockResolvedValueOnce(currentTask)
      .mockResolvedValueOnce({ ...currentTask, title: "After" });
    mocks.tx.task.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.sprintItem.findMany.mockResolvedValue([]);
    mocks.tx.auditLog.create.mockResolvedValue({ id: "audit-1" });
    mocks.enqueue.mockResolvedValue({ id: "job-1" });
  });

  it("reads invariants and writes through the same serializable transaction", async () => {
    await expect(
      updateTask(
        {
          userId: "user-1",
          workspaceId: "workspace-1",
        },
        "task-1",
        { title: "After" },
      ),
    ).resolves.toMatchObject({ id: "task-1", title: "After" });

    expect(mocks.outsideTaskRead).not.toHaveBeenCalled();
    expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
    expect(mocks.tx.task.findFirst).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: { id: "task-1", workspaceId: "workspace-1" } }),
    );
    expect(mocks.tx.task.updateMany).toHaveBeenCalledWith({
      where: { id: "task-1", workspaceId: "workspace-1" },
      data: { title: "After", sprintId: null },
    });
    expect(mocks.enqueue).toHaveBeenCalledOnce();
    expect(mocks.wake).toHaveBeenCalledOnce();
  });
});
