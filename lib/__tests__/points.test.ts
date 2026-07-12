import { describe, expect, it } from "vitest";
import { isStoryPoint, STORY_POINTS } from "../points";

describe("points", () => {
  it("defines the supported story-point scale", () => {
    expect(STORY_POINTS).toEqual([1, 2, 3, 5, 8, 13, 21, 34]);
  });

  describe("isStoryPoint", () => {
    it("accepts every supported point", () => {
      expect(STORY_POINTS.every(isStoryPoint)).toBe(true);
    });

    it("rejects unsupported values without implicit coercion", () => {
      for (const value of [0, 4, 6, 7, 10, 100, -1, "5", null]) {
        expect(isStoryPoint(value)).toBe(false);
      }
    });
  });
});
