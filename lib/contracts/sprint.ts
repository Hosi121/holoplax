import { z } from "zod";
import { OptionalNullableDateSchema } from "./common";

const toStringOrEmpty = (value: unknown) => (value == null ? "" : String(value));

export const SprintStartSchema = z
  .object({
    name: z.preprocess(toStringOrEmpty, z.string().trim()).optional(),
    capacityPoints: z.coerce.number().int().positive().max(10_000).optional(),
    plannedEndAt: OptionalNullableDateSchema,
  })
  .strip();

export const SprintUpdateSchema = z
  .object({
    name: z.preprocess(toStringOrEmpty, z.string().trim()).optional(),
    capacityPoints: z.coerce.number().int().positive().max(10_000).optional(),
    startedAt: OptionalNullableDateSchema,
    plannedEndAt: OptionalNullableDateSchema,
  })
  .strip();
