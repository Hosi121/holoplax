import { describe, expect, it } from "vitest";
import {
  graphHasCycleFrom,
  hasIncompleteChecklist,
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
});
