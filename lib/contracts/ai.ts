import { z } from "zod";

const toStringOrEmpty = (value: unknown) => (value == null ? "" : String(value));
const nonEmptyString = (message: string) =>
  z.preprocess(toStringOrEmpty, z.string().trim().min(1, message));

const nullableId = z
  .preprocess((value) => {
    if (value == null) return null;
    const text = String(value).trim();
    return text.length ? text : null;
  }, z.string().trim().min(1).nullable())
  .optional();

const positiveNumber = (message: string) =>
  z.coerce
    .number()
    .refine((value) => Number.isFinite(value) && value > 0, { message });

export const AiSuggestSchema = z
  .object({
    title: z.preprocess(toStringOrEmpty, z.string().trim()).optional(),
    description: z.preprocess(toStringOrEmpty, z.string().trim()).optional(),
    taskId: nullableId,
  })
  .passthrough();

export const AiScoreSchema = z
  .object({
    title: nonEmptyString("title is required"),
    description: z.preprocess(toStringOrEmpty, z.string().trim()).optional(),
    taskId: nullableId,
  })
  .passthrough();

export const AiSplitSchema = z
  .object({
    title: nonEmptyString("title is required"),
    description: z.preprocess(toStringOrEmpty, z.string().trim()).optional(),
    points: positiveNumber("points must be greater than 0"),
    taskId: nullableId,
  })
  .passthrough();

export const AiApplySchema = z
  .object({
    taskId: nonEmptyString("taskId is required"),
    type: nonEmptyString("type is required"),
    suggestionId: z.preprocess(toStringOrEmpty, z.string().trim()).optional(),
    payload: z.record(z.string(), z.any()).optional().nullable(),
  })
  .passthrough();

export const AiPrepSchema = z
  .object({
    taskId: nonEmptyString("taskId is required"),
    type: nonEmptyString("type is required"),
  })
  .passthrough();

export const AiPrepActionSchema = z
  .object({
    action: nonEmptyString("action is required"),
  })
  .passthrough();
