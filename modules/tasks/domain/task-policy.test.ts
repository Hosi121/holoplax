import { describe, expect, it } from "vitest";
import { findTaskPolicyViolation } from "./task-policy";

describe("task policy", () => {
  it("keeps epics in the backlog", () => {
    expect(findTaskPolicyViolation({ type: "EPIC", status: "SPRINT" })).toBe(
      "epics must remain in backlog",
    );
    expect(findTaskPolicyViolation({ type: "EPIC", status: "DONE" })).toBe(
      "epics must remain in backlog",
    );
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
});
