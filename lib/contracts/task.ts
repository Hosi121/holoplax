import { z } from "zod";
import { SEVERITY, TASK_STATUS, TASK_TYPE } from "../types";

const taskStatusValues = Object.values(TASK_STATUS) as [string, ...string[]];
const taskTypeValues = Object.values(TASK_TYPE) as [string, ...string[]];
const severityValues = Object.values(SEVERITY) as [string, ...string[]];

export const TaskStatusSchema = z.enum(taskStatusValues);
export const TaskTypeSchema = z.enum(taskTypeValues);

const toStringOrEmpty = (value: unknown) => (value == null ? "" : String(value));
// Converts null/undefined/"" to undefined so optional enum fields treat
// empty/absent input as "not provided" rather than a parse failure.
const toEnumInput = (value: unknown) =>
  value == null || String(value).trim() === "" ? undefined : String(value).trim();

const nullableId = z
  .preprocess((value) => {
    if (value == null) return null;
    const text = String(value).trim();
    return text.length ? text : null;
  }, z.string().trim().min(1).nullable())
  .optional();

const pointsAllowed = [1, 2, 3, 5, 8, 13, 21, 34] as const;
export const TaskPointsSchema = z.coerce
  .number()
  .refine((value) => pointsAllowed.includes(value as (typeof pointsAllowed)[number]), {
    message: "points must be one of 1,2,3,5,8,13,21,34",
  });

export const TaskChecklistItemSchema = z
  .object({
    id: z.string().optional(),
    // Cap text at 2000 chars — typical checklist items are short one-liners.
    text: z.string().max(2_000).optional(),
    done: z.boolean().optional(),
  })
  .strip();

// Cap at 200 items to prevent DoS via oversized checklist payloads.
export const TaskChecklistSchema = z.array(TaskChecklistItemSchema).max(200);

export const TaskCreateSchema = z
  .object({
    title: z.string().min(1).max(500),
    description: z.string().max(100_000).optional(),
    definitionOfDone: z.string().max(50_000).optional(),
    checklist: TaskChecklistSchema.optional().nullable(),
    points: TaskPointsSchema,
    urgency: z.enum(severityValues).optional(),
    risk: z.enum(severityValues).optional(),
    status: z.preprocess(toEnumInput, TaskStatusSchema.optional()),
    type: z.preprocess(toEnumInput, TaskTypeSchema.optional()),
    parentId: nullableId,
    dueDate: z.preprocess(toStringOrEmpty, z.string().trim()).optional().nullable(),
    assigneeId: nullableId,
    tags: z.array(z.string().max(100)).max(50).optional(),
    dependencyIds: z.array(z.string()).max(100).optional(),
    routineCadence: z.preprocess(toStringOrEmpty, z.string().trim()).optional().nullable(),
    routineNextAt: z.preprocess(toStringOrEmpty, z.string().trim()).optional().nullable(),
  })
  .strip();

export const TaskUpdateSchema = z
  .object({
    title: z.string().min(1).max(500).optional(),
    description: z.string().max(100_000).optional(),
    definitionOfDone: z.string().max(50_000).optional(),
    checklist: TaskChecklistSchema.optional().nullable(),
    points: TaskPointsSchema.optional(),
    urgency: z.enum(severityValues).optional(),
    risk: z.enum(severityValues).optional(),
    status: z.preprocess(toEnumInput, TaskStatusSchema.optional()),
    type: z.preprocess(toEnumInput, TaskTypeSchema.optional()),
    // NOTE: automationState is intentionally absent here. It is an internal
    // field managed exclusively by the server-side automation engine. Allowing
    // users to set SPLIT_PARENT / SPLIT_CHILD / DELEGATED etc. directly would
    // break automation invariants.
    parentId: nullableId,
    dueDate: z.preprocess(toStringOrEmpty, z.string().trim()).optional().nullable(),
    assigneeId: nullableId,
    tags: z.array(z.string().max(100)).max(50).optional(),
    dependencyIds: z.array(z.string()).max(100).optional(),
    routineCadence: z.preprocess(toStringOrEmpty, z.string().trim()).optional().nullable(),
    routineNextAt: z.preprocess(toStringOrEmpty, z.string().trim()).optional().nullable(),
  })
  .strip();
