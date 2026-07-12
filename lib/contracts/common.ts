import { z } from "zod";

const isValidDateString = (value: string): boolean => !Number.isNaN(new Date(value).getTime());

const DateStringSchema = z.string().trim().refine(isValidDateString, "invalid date");

/**
 * Optional request date. Empty strings and null clear a nullable field; any
 * non-empty value must be parseable before it reaches Prisma.
 */
export const OptionalNullableDateSchema = z
  .preprocess(
    (value) => (value == null || String(value).trim() === "" ? null : String(value).trim()),
    DateStringSchema.nullable(),
  )
  .optional();
