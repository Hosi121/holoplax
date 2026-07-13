import { describe, expect, it } from "vitest";
import {
  conflictingLifecycleRequest,
  nextWorkflowState,
  projectLegacyStatus,
} from "./task-workflow";

describe("task workflow compatibility", () => {
  it("maps completion to the legacy done projection", () => {
    expect(
      projectLegacyStatus({
        current: "SPRINT",
        workflowState: "DONE",
      }),
    ).toBe("DONE");
  });

  it("restores the supplied planning projection when completed work is reopened", () => {
    expect(
      projectLegacyStatus({
        current: "SPRINT",
        workflowState: "IN_PROGRESS",
      }),
    ).toBe("SPRINT");
    expect(
      projectLegacyStatus({
        current: "BACKLOG",
        workflowState: "READY",
      }),
    ).toBe("BACKLOG");
  });

  it("keeps legacy status-only clients compatible", () => {
    expect(nextWorkflowState({ current: "READY", requestedStatus: "DONE" })).toBe("DONE");
    expect(nextWorkflowState({ current: "DONE", requestedStatus: "BACKLOG" })).toBe("READY");
  });

  it("rejects contradictory lifecycle fields", () => {
    expect(conflictingLifecycleRequest({ status: "DONE", workflowState: "READY" })).toBe(true);
    expect(conflictingLifecycleRequest({ status: "SPRINT", workflowState: "DONE" })).toBe(true);
  });
});
