import { describe, expect, it, vi } from "vitest";
import {
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
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        upsert: vi.fn().mockResolvedValue({}),
      },
    };

    await syncTaskDependencies(tx as never, {
      taskId: "task-1",
      workspaceId: "workspace-1",
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
  });
});
