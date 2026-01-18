import { z } from "zod";
import { TASK_STATUS, TASK_TYPE } from "../types";

const taskStatusValues = Object.values(TASK_STATUS) as [string, ...string[]];
const taskTypeValues = Object.values(TASK_TYPE) as [string, ...string[]];

export const TaskStatusSchema = z.enum(taskStatusValues);
export const TaskTypeSchema = z.enum(taskTypeValues);

const pointsAllowed = [1, 2, 3, 5, 8, 13, 21, 34] as const;
export const TaskPointsSchema = z
  .coerce
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
  .passthrough();

export const TaskChecklistSchema = z.array(TaskChecklistItemSchema);

export const TaskCreateSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().optional(),
    definitionOfDone: z.string().optional(),
    checklist: TaskChecklistSchema.optional().nullable(),
    points: TaskPointsSchema,
    urgency: z.string().optional(),
    risk: z.string().optional(),
    status: TaskStatusSchema.optional(),
    type: TaskTypeSchema.optional(),
    parentId: z.string().optional().nullable(),
    dueDate: z.string().optional().nullable(),
    assigneeId: z.string().optional().nullable(),
    tags: z.array(z.string()).optional(),
    dependencyIds: z.array(z.string()).optional(),
    routineCadence: z.enum(["DAILY", "WEEKLY", "NONE"]).optional().nullable(),
    routineNextAt: z.string().optional().nullable(),
  })
  .passthrough();

export const TaskUpdateSchema = z
  .object({
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    definitionOfDone: z.string().optional(),
    checklist: TaskChecklistSchema.optional().nullable(),
    points: TaskPointsSchema.optional(),
    urgency: z.string().optional(),
    risk: z.string().optional(),
    status: TaskStatusSchema.optional(),
    type: TaskTypeSchema.optional(),
    parentId: z.string().optional().nullable(),
    dueDate: z.string().optional().nullable(),
    assigneeId: z.string().optional().nullable(),
    tags: z.array(z.string()).optional(),
    dependencyIds: z.array(z.string()).optional(),
    routineCadence: z.enum(["DAILY", "WEEKLY", "NONE"]).optional().nullable(),
    routineNextAt: z.string().optional().nullable(),
  })
  .passthrough();
