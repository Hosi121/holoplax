import { z } from "zod";

const toStringOrEmpty = (value: unknown) => (value == null ? "" : String(value));

export const SprintStartSchema = z
  .object({
    name: z.preprocess(toStringOrEmpty, z.string().trim()).optional(),
    capacityPoints: z.coerce.number().int().positive().max(10_000).optional(),
    plannedEndAt: z.preprocess(toStringOrEmpty, z.string().trim()).optional().nullable(),
  })
  .strip();

export const SprintUpdateSchema = z
  .object({
    name: z.preprocess(toStringOrEmpty, z.string().trim()).optional(),
    capacityPoints: z.coerce.number().int().positive().max(10_000).optional(),
    startedAt: z.preprocess(toStringOrEmpty, z.string().trim()).optional().nullable(),
    plannedEndAt: z.preprocess(toStringOrEmpty, z.string().trim()).optional().nullable(),
  })
  .strip();
