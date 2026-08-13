import type { Task } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  persistNewTask: vi.fn(),
}));

vi.mock("../../modules/tasks/infrastructure/prisma-task-writer", () => ({
  persistNewTask: mocks.persistNewTask,
}));

import {
  createNextRoutineOccurrence,
  syncRoutineRule,
} from "../../modules/tasks/infrastructure/prisma-task-write";

const task = {
  id: "task-1",
  title: "Routine",
  description: "",
  definitionOfDone: "",
  checklist: null,
  points: 1,
  urgency: "MEDIUM",
  risk: "LOW",
  status: "DONE",
  workflowState: "DONE",
  type: "TASK",
  automationStatus: "NONE",
  hierarchyRole: "STANDARD",
  origin: "MANUAL",
  parentId: null,
  sprintId: null,
  routineSeriesId: "series-1",
  dueDate: null,
  assigneeId: null,
  tags: [],
  userId: "user-1",
  workspaceId: "workspace-1",
  createdAt: new Date(),
  updatedAt: new Date(),
} as Task;

describe("routine series", () => {
  beforeEach(() => vi.clearAllMocks());

  it("keeps a stable series id when creating the next occurrence", async () => {
    const nextTask = { ...task, id: "task-2", status: "BACKLOG", workflowState: "READY" };
    mocks.persistNewTask.mockResolvedValue(nextTask);
    const tx = {
      routineRule: {
        findUnique: vi.fn(),
        update: vi.fn().mockResolvedValue({ id: "rule-1" }),
      },
      routineSeries: { update: vi.fn().mockResolvedValue({ id: "series-1" }) },
    };

    await expect(
      createNextRoutineOccurrence(tx as never, {
        task: {
          ...task,
          routineRule: { cadence: "DAILY", nextAt: new Date("2099-01-01"), seriesId: "series-1" },
        },
        userId: "user-1",
        workspaceId: "workspace-1",
      }),
    ).resolves.toEqual(nextTask);

    expect(mocks.persistNewTask).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ routineSeriesId: "series-1", origin: "ROUTINE" }),
      expect.anything(),
    );
    expect(tx.routineRule.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ taskId: "task-2" }) }),
    );
    expect(tx.routineSeries.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "series-1" } }),
    );
  });

  it("updates the series schedule together with its active rule", async () => {
    const update = vi.fn().mockResolvedValue({});
    const tx = {
      routineRule: { update },
      routineSeries: { update: vi.fn().mockResolvedValue({}) },
    };
    const nextAt = new Date("2099-02-01");

    await syncRoutineRule(tx as never, {
      task: {
        ...task,
        routineRule: { cadence: "DAILY", nextAt, seriesId: "series-1" },
      },
      cadenceValue: "WEEKLY",
      routineNextAt: nextAt,
      shouldClearRoutine: false,
    });

    expect(tx.routineSeries.update).toHaveBeenCalledWith({
      where: { id: "series-1" },
      data: { cadence: "WEEKLY", nextAt, active: true },
    });
  });
});
