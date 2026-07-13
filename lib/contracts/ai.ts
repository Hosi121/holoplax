import { z } from "zod";
import { SEVERITY, TASK_STATUS } from "../types";
import { TaskPointsSchema } from "./task";

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

export const AiSuggestSchema = z
  .object({
    title: z.preprocess(toStringOrEmpty, z.string().trim()).optional(),
    description: z.preprocess(toStringOrEmpty, z.string().trim()).optional(),
    taskId: nullableId,
  })
  .strip();

export const AiScoreSchema = z
  .object({
    title: nonEmptyString("title is required"),
    description: z.preprocess(toStringOrEmpty, z.string().trim()).optional(),
    taskId: nullableId,
  })
  .strip();

export const AiSplitSchema = z
  .object({
    title: nonEmptyString("title is required"),
    description: z.preprocess(toStringOrEmpty, z.string().trim()).optional(),
    points: TaskPointsSchema,
    taskId: nullableId,
  })
  .strip();

export const AiApplySchema = z
  .object({
    taskId: nonEmptyString("taskId is required"),
    type: nonEmptyString("type is required"),
    suggestionId: z.preprocess(toStringOrEmpty, z.string().trim()).optional(),
    payload: z.record(z.string(), z.any()).optional().nullable(),
  })
  .strip();

const severityValues = [SEVERITY.LOW, SEVERITY.MEDIUM, SEVERITY.HIGH] as const;

export const AiSplitApplyPayloadSchema = z
  .object({
    status: z.enum([TASK_STATUS.BACKLOG, TASK_STATUS.SPRINT]),
    suggestions: z
      .array(
        z
          .object({
            title: z.string().trim().min(1).max(500),
            detail: z.string().max(100_000).optional().default(""),
            points: TaskPointsSchema,
            urgency: z.enum(severityValues).optional().default(SEVERITY.MEDIUM),
            risk: z.enum(severityValues).optional().default(SEVERITY.MEDIUM),
          })
          .strip(),
      )
      .min(1)
      .max(50),
  })
  .strip();

export const AiPrepSchema = z
  .object({
    taskId: nonEmptyString("taskId is required"),
    type: nonEmptyString("type is required"),
  })
  .strip();

export const AiPrepActionSchema = z
  .object({
    action: nonEmptyString("action is required"),
  })
  .strip();

export const AiReactionSchema = z
  .object({
    suggestionId: nonEmptyString("suggestionId is required"),
    reaction: z.enum(["VIEWED", "ACCEPTED", "MODIFIED", "REJECTED", "IGNORED"]),
    // コンテキスト情報
    context: z
      .object({
        taskType: z.string().optional(),
        taskPoints: z.number().optional(),
        hourOfDay: z.number().min(0).max(23).optional(),
        dayOfWeek: z.number().min(0).max(6).optional(),
        wipCount: z.number().optional(),
        flowState: z.number().optional(),
      })
      .optional(),
    // 修正の詳細（MODIFIEDの場合）
    modification: z.record(z.string(), z.any()).optional().nullable(),
    // タイミング
    viewedAt: z.string().datetime().optional(),
    reactedAt: z.string().datetime().optional(),
  })
  .strip();
