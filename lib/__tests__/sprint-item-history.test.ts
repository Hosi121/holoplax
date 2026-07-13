import { describe, expect, it, vi } from "vitest";
import {
  commitTaskToSprint,
  completeTaskCommitment,
} from "../../modules/shared/infrastructure/prisma-sprint-items";

const task = { id: "task-1", title: "Task", type: "TASK" as const, points: 5 };

describe("sprint commitment history", () => {
  it("links a new commitment to its previous carryover and records an event", async () => {
    const item = {
      id: "item-2",
      taskTitle: "Task",
      taskType: "TASK" as const,
      committedPoints: 5,
    };
    const tx = {
      sprintItem: {
        findUnique: vi.fn().mockResolvedValue(null),
        findFirst: vi.fn().mockResolvedValue({ id: "item-1" }),
        create: vi.fn().mockResolvedValue(item),
      },
      sprintItemEvent: { create: vi.fn().mockResolvedValue({ id: "event-1" }) },
    };

    await commitTaskToSprint(tx as never, { sprintId: "sprint-2", task });

    expect(tx.sprintItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ carriedFromId: "item-1", committedPoints: 5 }),
    });
    expect(tx.sprintItemEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ sprintItemId: "item-2", type: "COMMITTED" }),
    });
  });

  it("records recommitment without erasing the prior event stream", async () => {
    const existing = {
      id: "item-1",
      taskTitle: "Old title",
      taskType: "TASK" as const,
      committedPoints: 3,
      outcome: "REMOVED",
      removedAt: new Date(),
    };
    const recommitted = {
      ...existing,
      taskTitle: "Task",
      committedPoints: 5,
      outcome: "COMMITTED",
      removedAt: null,
    };
    const tx = {
      sprintItem: {
        findUnique: vi.fn().mockResolvedValue(existing),
        update: vi.fn().mockResolvedValue(recommitted),
      },
      sprintItemEvent: { create: vi.fn().mockResolvedValue({ id: "event-2" }) },
    };

    await commitTaskToSprint(tx as never, { sprintId: "sprint-1", task });

    expect(tx.sprintItemEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sprintItemId: "item-1",
        type: "RECOMMITTED",
        committedPoints: 5,
      }),
    });
  });

  it("does not emit duplicate completion events", async () => {
    const tx = {
      sprintItem: {
        findUnique: vi.fn().mockResolvedValue({
          id: "item-1",
          taskTitle: "Task",
          taskType: "TASK",
          committedPoints: 5,
          outcome: "COMPLETED",
          removedAt: null,
        }),
        updateMany: vi.fn(),
      },
      sprintItemEvent: { create: vi.fn() },
    };

    await completeTaskCommitment(tx as never, { taskId: "task-1", sprintId: "sprint-1" });

    expect(tx.sprintItem.updateMany).not.toHaveBeenCalled();
    expect(tx.sprintItemEvent.create).not.toHaveBeenCalled();
  });
});
