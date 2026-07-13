import { describe, expect, it } from "vitest";
import { findTaskHierarchyViolation, findTaskPolicyViolation } from "./task-policy";

describe("task policy", () => {
  it("keeps epics out of direct sprint commitment but allows completion", () => {
    expect(findTaskPolicyViolation({ type: "EPIC", status: "SPRINT" })).toBe(
      "epics cannot be committed directly to a sprint",
    );
    expect(findTaskPolicyViolation({ type: "EPIC", status: "DONE" })).toBeNull();
  });

  it("requires checklist completion before done", () => {
    expect(
      findTaskPolicyViolation({
        type: "TASK",
        status: "DONE",
        checklist: [{ text: "remaining", done: false }],
      }),
    ).toBe("all checklist items must be complete before moving to done");
  });

  it("allows dependency cleanup by moving back to backlog", () => {
    expect(
      findTaskPolicyViolation({
        type: "PBI",
        status: "BACKLOG",
        hasUnresolvedDependencies: true,
      }),
    ).toBeNull();
  });

  it("separates sprint planning from starting blocked work", () => {
    expect(
      findTaskPolicyViolation({
        type: "TASK",
        status: "SPRINT",
        workflowState: "READY",
        hasUnresolvedDependencies: true,
      }),
    ).toBeNull();
    expect(
      findTaskPolicyViolation({
        type: "TASK",
        status: "SPRINT",
        workflowState: "IN_PROGRESS",
        hasUnresolvedDependencies: true,
      }),
    ).toBe("dependencies must be done before moving");
  });

  it("requires containers to finish their children before completion", () => {
    expect(
      findTaskPolicyViolation({
        type: "PBI",
        status: "DONE",
        hasIncompleteChildren: true,
      }),
    ).toBe("all child work items must be done before completing the parent");
  });

  it("enforces work-breakdown parent kinds", () => {
    expect(findTaskHierarchyViolation({ type: "PBI", parentType: "TASK" })).toBe(
      "a PBI parent must be an epic",
    );
    expect(findTaskHierarchyViolation({ type: "TASK", parentType: "EPIC" })).toBe(
      "a task cannot be placed directly under an epic",
    );
    expect(findTaskHierarchyViolation({ type: "TASK", parentType: "PBI" })).toBeNull();
  });
});
