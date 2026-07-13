import { describe, expect, it } from "vitest";
import { projectLegacyAutomationState } from "./task-automation";

describe("legacy automation projection", () => {
  it("keeps structural provenance independent from automation lifecycle", () => {
    expect(
      projectLegacyAutomationState({
        automationStatus: "SPLIT_REJECTED",
        hierarchyRole: "SPLIT_CHILD",
      }),
    ).toBe("SPLIT_CHILD");
    expect(
      projectLegacyAutomationState({
        automationStatus: "SPLIT_REJECTED",
        hierarchyRole: "STANDARD",
      }),
    ).toBe("SPLIT_REJECTED");
  });
});
