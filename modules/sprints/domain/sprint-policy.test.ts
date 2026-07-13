import { describe, expect, it } from "vitest";
import { sprintWindowViolation } from "./sprint-policy";

describe("sprintWindowViolation", () => {
  it("rejects an end before the start", () => {
    expect(
      sprintWindowViolation({
        startedAt: new Date("2026-07-14T00:00:00Z"),
        plannedEndAt: new Date("2026-07-13T00:00:00Z"),
      }),
    ).toBe("planned end must not be before sprint start");
  });

  it("allows an equal or absent planned end", () => {
    const startedAt = new Date("2026-07-13T00:00:00Z");
    expect(sprintWindowViolation({ startedAt, plannedEndAt: startedAt })).toBeNull();
    expect(sprintWindowViolation({ startedAt, plannedEndAt: null })).toBeNull();
  });
});
