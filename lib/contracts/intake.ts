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

// taskType is a TaskType enum, not an arbitrary id — validate it as such so an
// invalid value is rejected with a 400 rather than silently coerced downstream.
const nullableTaskType = z
  .preprocess((value) => {
    if (value == null) return null;
    const text = String(value).trim().toUpperCase();
    return text.length ? text : null;
  }, z.enum(["EPIC", "PBI", "TASK", "ROUTINE"]).nullable())
  .optional();

export const IntakeMemoSchema = z
  .object({
    text: z.preprocess(toStringOrEmpty, z.string().trim().min(1, "text is required").max(50_000)),
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
    taskType: nullableTaskType,
    targetTaskId: nullableId,
  })
  .strip();
