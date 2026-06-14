import { z } from "zod";

const toStringOrEmpty = (value: unknown) => (value == null ? "" : String(value));
const nonEmptyString = (message: string) =>
  z.preprocess(toStringOrEmpty, z.string().trim().min(1, message));

export const VelocityCreateSchema = z
  .object({
    name: nonEmptyString("name is required"),
    // A velocity entry's points is the SUM of story points delivered in a
    // range, so it is not restricted to the Fibonacci scale — but it must be a
    // positive integer within a sane bound (the column is Int; a float would be
    // rejected by the DB with a 500 instead of a clean 400).
    points: z.coerce
      .number()
      .int("points must be an integer")
      .min(1, "points must be positive")
      .max(100000, "points is unreasonably large"),
    range: nonEmptyString("range is required"),
  })
  .strip();
