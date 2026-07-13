import { describe, expect, it, vi } from "vitest";
import {
  deactivateRoutineSeriesForDeletedTask,
  graphHasCycleFrom,
  hasIncompleteChecklist,
  syncTaskDependencies,
} from "../../modules/tasks/infrastructure/prisma-task-write";

describe("task graph invariants", () => {
  it("detects direct and transitive cycles", () => {
    expect(graphHasCycleFrom("a", new Map([["a", ["a"]]]))).toBe(true);
    expect(
      graphHasCycleFrom(
        "a",
        new Map([
          ["a", ["b"]],
          ["b", ["c"]],
          ["c", ["a"]],
        ]),
      ),
    ).toBe(true);
  });

  it("accepts an acyclic dependency graph", () => {
    expect(
      graphHasCycleFrom(
        "a",
        new Map([
          ["a", ["b", "c"]],
          ["b", ["c"]],
        ]),
      ),
    ).toBe(false);
  });

  it("requires every checklist item to be done", () => {
    expect(hasIncompleteChecklist([{ text: "x", done: false }])).toBe(true);
    expect(hasIncompleteChecklist([{ text: "x", done: true }])).toBe(false);
    expect(hasIncompleteChecklist(null)).toBe(false);
  });

  it("waives removed dependencies and can reactivate existing edges", async () => {
    const tx = {
      task: { findMany: vi.fn().mockResolvedValue([{ id: "dependency-1" }]) },
      taskDependency: {
        findMany: vi.fn().mockResolvedValue([
          { dependsOnId: "dependency-1", state: "WAIVED" },
          { dependsOnId: "dependency-2", state: "REQUIRED" },
        ]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        upsert: vi.fn().mockResolvedValue({}),
      },
      taskDependencyEvent: {
        create: vi.fn().mockResolvedValue({}),
        createMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };

    await syncTaskDependencies(tx as never, {
      taskId: "task-1",
      workspaceId: "workspace-1",
      actorId: "user-1",
      dependencyIds: ["dependency-1"],
    });

    expect(tx.taskDependency.updateMany).toHaveBeenCalledWith({
      where: {
        taskId: "task-1",
        state: "REQUIRED",
        dependsOnId: { notIn: ["dependency-1"] },
      },
      data: { state: "WAIVED", waivedAt: expect.any(Date) },
    });
    expect(tx.taskDependency.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          taskId_dependsOnId: { taskId: "task-1", dependsOnId: "dependency-1" },
        },
        update: { state: "REQUIRED", waivedAt: null },
      }),
    );
    expect(tx.taskDependencyEvent.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          dependsOnKey: "dependency-2",
          type: "WAIVED",
          actorId: "user-1",
        }),
      ],
    });
    expect(tx.taskDependencyEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        dependsOnKey: "dependency-1",
        type: "REQUIRED",
        reason: "REACTIVATED",
      }),
    });
  });

  it("stops a routine only when its current occurrence is deleted", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const tx = { routineSeries: { updateMany } };

    await expect(
      deactivateRoutineSeriesForDeletedTask(tx as never, {
        routineRule: { seriesId: "series-1" },
      }),
    ).resolves.toEqual({ count: 1 });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "series-1", active: true },
      data: { active: false },
    });

    updateMany.mockClear();
    await expect(
      deactivateRoutineSeriesForDeletedTask(tx as never, { routineRule: null }),
    ).resolves.toEqual({ count: 0 });
    expect(updateMany).not.toHaveBeenCalled();
  });
});
