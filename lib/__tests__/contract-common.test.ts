import { describe, expect, it } from "vitest";
import { OptionalNullableDateSchema } from "../contracts/common";

describe("OptionalNullableDateSchema", () => {
  it("accepts date-only and ISO date-time inputs", () => {
    expect(OptionalNullableDateSchema.parse("2026-07-12")).toBe("2026-07-12");
    expect(OptionalNullableDateSchema.parse("2026-07-12T12:30:00Z")).toBe("2026-07-12T12:30:00Z");
  });

  it("normalizes empty inputs to null and preserves omission", () => {
    expect(OptionalNullableDateSchema.parse("")).toBeNull();
    expect(OptionalNullableDateSchema.parse(null)).toBeNull();
    expect(OptionalNullableDateSchema.parse(undefined)).toBeUndefined();
  });

  it("rejects invalid dates before they reach Prisma", () => {
    expect(OptionalNullableDateSchema.safeParse("not-a-date").success).toBe(false);
  });
});
