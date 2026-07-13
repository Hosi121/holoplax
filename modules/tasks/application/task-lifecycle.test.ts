import { describe, expect, it } from "vitest";
import { planTaskLifecycleUpdate } from "./task-lifecycle";

const standardTask = {
  type: "TASK" as const,
  checklist: null,
  hasUnresolvedDependencies: false,
  hasIncompleteChildren: false,
};

describe("planTaskLifecycleUpdate", () => {
  it("projects completion consistently into both lifecycle representations", () => {
    expect(
      planTaskLifecycleUpdate({
        currentStatus: "SPRINT",
        currentWorkflowState: "IN_PROGRESS",
        requestedWorkflowState: "DONE",
        policy: standardTask,
      }),
    ).toEqual({ status: "DONE", workflowState: "DONE", violation: null });
  });

  it("rejects starting work while a required dependency is unresolved", () => {
    expect(
      planTaskLifecycleUpdate({
        currentStatus: "SPRINT",
        currentWorkflowState: "READY",
        requestedWorkflowState: "BLOCKED",
        policy: { ...standardTask, hasUnresolvedDependencies: true },
      }).violation,
    ).toBe("dependencies must be done before moving");
  });

  it("reopens completed work into a ready backlog item", () => {
    expect(
      planTaskLifecycleUpdate({
        currentStatus: "DONE",
        currentWorkflowState: "DONE",
        requestedStatus: "BACKLOG",
        policy: standardTask,
      }),
    ).toEqual({ status: "BACKLOG", workflowState: "READY", violation: null });
  });

  it.each([
    "BACKLOG",
    "SPRINT",
  ] as const)("reopens canceled work as ready when moving it to %s", (requestedStatus) => {
    expect(
      planTaskLifecycleUpdate({
        currentStatus: "BACKLOG",
        currentWorkflowState: "CANCELED",
        requestedStatus,
        policy: standardTask,
      }),
    ).toEqual({ status: requestedStatus, workflowState: "READY", violation: null });
  });

  it("rejects conflicting legacy and workflow lifecycle requests", () => {
    expect(
      planTaskLifecycleUpdate({
        currentStatus: "BACKLOG",
        currentWorkflowState: "READY",
        requestedStatus: "DONE",
        requestedWorkflowState: "IN_PROGRESS",
        policy: standardTask,
      }).violation,
    ).toBe("status and workflowState describe conflicting lifecycle states");
  });
});
