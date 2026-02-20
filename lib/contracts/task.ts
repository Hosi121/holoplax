import { z } from "zod";
import { SEVERITY, TASK_STATUS, TASK_TYPE } from "../types";

const taskStatusValues = Object.values(TASK_STATUS) as [string, ...string[]];
const taskTypeValues = Object.values(TASK_TYPE) as [string, ...string[]];
const severityValues = Object.values(SEVERITY) as [string, ...string[]];

export const TaskStatusSchema = z.enum(taskStatusValues);
export const TaskTypeSchema = z.enum(taskTypeValues);

const toStringOrEmpty = (value: unknown) => (value == null ? "" : String(value));
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
    text: z.string().optional(),
    done: z.boolean().optional(),
  })
  .strip();

export const TaskChecklistSchema = z.array(TaskChecklistItemSchema);

export const TaskCreateSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().optional(),
    definitionOfDone: z.string().optional(),
    checklist: TaskChecklistSchema.optional().nullable(),
    points: TaskPointsSchema,
    urgency: z.enum(severityValues).optional(),
    risk: z.enum(severityValues).optional(),
    status: z.preprocess(toStringOrEmpty, z.string().trim()).optional(),
    type: z.preprocess(toStringOrEmpty, z.string().trim()).optional(),
    parentId: nullableId,
    dueDate: z.preprocess(toStringOrEmpty, z.string().trim()).optional().nullable(),
    assigneeId: nullableId,
    tags: z.array(z.any()).optional(),
    dependencyIds: z.array(z.any()).optional(),
    routineCadence: z.preprocess(toStringOrEmpty, z.string().trim()).optional().nullable(),
    routineNextAt: z.preprocess(toStringOrEmpty, z.string().trim()).optional().nullable(),
  })
  .strip();

export const TaskUpdateSchema = z
  .object({
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    definitionOfDone: z.string().optional(),
    checklist: TaskChecklistSchema.optional().nullable(),
    points: TaskPointsSchema.optional(),
    urgency: z.enum(severityValues).optional(),
    risk: z.enum(severityValues).optional(),
    status: z.preprocess(toStringOrEmpty, z.string().trim()).optional(),
    type: z.preprocess(toStringOrEmpty, z.string().trim()).optional(),
    // NOTE: automationState is intentionally absent here. It is an internal
    // field managed exclusively by the server-side automation engine. Allowing
    // users to set SPLIT_PARENT / SPLIT_CHILD / DELEGATED etc. directly would
    // break automation invariants.
    parentId: nullableId,
    dueDate: z.preprocess(toStringOrEmpty, z.string().trim()).optional().nullable(),
    assigneeId: nullableId,
    tags: z.array(z.any()).optional(),
    dependencyIds: z.array(z.any()).optional(),
    routineCadence: z.preprocess(toStringOrEmpty, z.string().trim()).optional().nullable(),
    routineNextAt: z.preprocess(toStringOrEmpty, z.string().trim()).optional().nullable(),
  })
  .strip();
