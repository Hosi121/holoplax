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

export const IntakeMemoSchema = z
  .object({
    text: nonEmptyString("text is required"),
    workspaceId: nullableId,
    assignToCurrentWorkspace: z.boolean().optional(),
  })
  .strip();

export const IntakeAnalyzeSchema = z
  .object({
    intakeId: nonEmptyString("intakeId is required"),
    workspaceId: nonEmptyString("workspaceId is required"),
  })
  .strip();

export const IntakeResolveSchema = z
  .object({
    intakeId: nonEmptyString("intakeId is required"),
    action: nonEmptyString("action is required"),
    workspaceId: nullableId,
    taskType: nullableId,
    targetTaskId: nullableId,
  })
  .strip();
