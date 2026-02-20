import { z } from "zod";

const toStringOrEmpty = (value: unknown) => (value == null ? "" : String(value));
const nonEmptyString = (message: string) =>
  z.preprocess(toStringOrEmpty, z.string().trim().min(1, message));

export const MemoryClaimCreateSchema = z
  .object({
    typeId: nonEmptyString("typeId is required"),
    value: z.unknown(),
  })
  .strip();

export const MemoryClaimDeleteSchema = z
  .object({
    claimId: nonEmptyString("claimId is required"),
  })
  .strip();

export const MemoryQuestionCreateSchema = z
  .object({
    typeId: nonEmptyString("typeId is required"),
    confidence: z
      .preprocess((value) => {
        if (value === null || value === undefined || value === "") return undefined;
        return Number(value);
      }, z.number())
      .optional(),
    valueStr: z.preprocess(toStringOrEmpty, z.string()).optional().nullable(),
    valueNum: z
      .preprocess((value) => {
        if (value === null || value === undefined || value === "") return null;
        return Number(value);
      }, z.number().nullable())
      .optional(),
    valueBool: z.boolean().optional().nullable(),
    valueJson: z.unknown().optional().nullable(),
  })
  .strip();

export const MemoryQuestionActionSchema = z
  .object({
    action: nonEmptyString("action is required"),
  })
  .strip();
