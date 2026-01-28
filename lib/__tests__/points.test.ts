import { describe, expect, it } from "vitest";
import { badPoints, isStoryPoint, storyPointOptions } from "../points";

describe("points", () => {
  describe("storyPointOptions", () => {
    it("should contain Fibonacci-like sequence", () => {
      expect(storyPointOptions).toEqual([1, 2, 3, 5, 8, 13, 21, 34]);
    });
  });

  describe("isStoryPoint", () => {
    it("should return true for valid story points", () => {
      expect(isStoryPoint(1)).toBe(true);
      expect(isStoryPoint(2)).toBe(true);
      expect(isStoryPoint(3)).toBe(true);
      expect(isStoryPoint(5)).toBe(true);
      expect(isStoryPoint(8)).toBe(true);
      expect(isStoryPoint(13)).toBe(true);
      expect(isStoryPoint(21)).toBe(true);
      expect(isStoryPoint(34)).toBe(true);
    });

    it("should return false for invalid story points", () => {
      expect(isStoryPoint(0)).toBe(false);
      expect(isStoryPoint(4)).toBe(false);
      expect(isStoryPoint(6)).toBe(false);
      expect(isStoryPoint(7)).toBe(false);
      expect(isStoryPoint(10)).toBe(false);
      expect(isStoryPoint(100)).toBe(false);
      expect(isStoryPoint(-1)).toBe(false);
    });

    it("should handle string-like numbers", () => {
      // @ts-expect-error - testing runtime behavior
      expect(isStoryPoint("5")).toBe(true);
      // @ts-expect-error - testing runtime behavior
      expect(isStoryPoint("4")).toBe(false);
    });
  });

  describe("badPoints", () => {
    it("should return false for valid story points", () => {
      expect(badPoints(1)).toBe(false);
      expect(badPoints(5)).toBe(false);
      expect(badPoints(13)).toBe(false);
    });

    it("should return true for invalid story points", () => {
      expect(badPoints(0)).toBe(true);
      expect(badPoints(4)).toBe(true);
      expect(badPoints(100)).toBe(true);
    });
  });
});
