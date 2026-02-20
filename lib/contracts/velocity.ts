import { z } from "zod";

const toStringOrEmpty = (value: unknown) => (value == null ? "" : String(value));
const nonEmptyString = (message: string) =>
  z.preprocess(toStringOrEmpty, z.string().trim().min(1, message));

export const VelocityCreateSchema = z
  .object({
    name: nonEmptyString("name is required"),
    points: z.coerce.number().refine((value) => Number.isFinite(value) && value > 0, {
      message: "points must be positive",
    }),
    range: nonEmptyString("range is required"),
  })
  .strip();
