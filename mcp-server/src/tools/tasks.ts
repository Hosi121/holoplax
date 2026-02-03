import { z } from "zod";
import { getContext } from "../context.js";
import {
  type CreateTaskInput,
  createTask,
  deleteTask,
  getTask,
  listTasks,
  type TaskFilters,
  type UpdateTaskInput,
  updateTask,
} from "../services/tasks.js";

const TASK_STATUS_VALUES = ["BACKLOG", "SPRINT", "DONE"] as const;
const TASK_TYPE_VALUES = ["EPIC", "PBI", "TASK", "ROUTINE"] as const;
const SEVERITY_VALUES = ["LOW", "MEDIUM", "HIGH"] as const;
const POINTS_VALUES = [1, 2, 3, 5, 8, 13, 21, 34] as const;

export const listTasksSchema = z.object({
  status: z.array(z.enum(TASK_STATUS_VALUES)).optional(),
  type: z.array(z.enum(TASK_TYPE_VALUES)).optional(),
  urgency: z.enum(SEVERITY_VALUES).optional(),
  risk: z.enum(SEVERITY_VALUES).optional(),
  tags: z.array(z.string()).optional(),
  assigneeId: z.string().optional(),
  dueBefore: z.string().optional(),
  dueAfter: z.string().optional(),
  minPoints: z.number().optional(),
  maxPoints: z.number().optional(),
  search: z.string().optional(),
  limit: z.number().min(1).max(500).optional(),
  cursor: z.string().optional(),
});

export const getTaskSchema = z.object({
  taskId: z.string().min(1, "taskId is required"),
});

export const createTaskSchema = z.object({
  title: z.string().min(1, "title is required"),
  description: z.string().optional(),
  definitionOfDone: z.string().optional(),
  points: z.number().refine((v) => POINTS_VALUES.includes(v as (typeof POINTS_VALUES)[number]), {
    message: "points must be one of 1,2,3,5,8,13,21,34",
  }),
  urgency: z.enum(SEVERITY_VALUES).optional(),
  risk: z.enum(SEVERITY_VALUES).optional(),
  status: z.enum(TASK_STATUS_VALUES).optional(),
  type: z.enum(TASK_TYPE_VALUES).optional(),
  parentId: z.string().optional(),
  dueDate: z.string().optional(),
  assigneeId: z.string().optional(),
  tags: z.array(z.string()).optional(),
  dependencyIds: z.array(z.string()).optional(),
});

export const updateTaskSchema = z.object({
  taskId: z.string().min(1, "taskId is required"),
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  definitionOfDone: z.string().optional(),
  points: z
    .number()
    .refine((v) => POINTS_VALUES.includes(v as (typeof POINTS_VALUES)[number]), {
      message: "points must be one of 1,2,3,5,8,13,21,34",
    })
    .optional(),
  urgency: z.enum(SEVERITY_VALUES).optional(),
  risk: z.enum(SEVERITY_VALUES).optional(),
  status: z.enum(TASK_STATUS_VALUES).optional(),
  type: z.enum(TASK_TYPE_VALUES).optional(),
  parentId: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  assigneeId: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  dependencyIds: z.array(z.string()).optional(),
});

export const deleteTaskSchema = z.object({
  taskId: z.string().min(1, "taskId is required"),
});

export async function handleListTasks(args: unknown) {
  const parsed = listTasksSchema.parse(args);
  const ctx = getContext();
  const filters: TaskFilters = {
    status: parsed.status,
    type: parsed.type,
    urgency: parsed.urgency,
    risk: parsed.risk,
    tags: parsed.tags,
    assigneeId: parsed.assigneeId,
    dueBefore: parsed.dueBefore,
    dueAfter: parsed.dueAfter,
    minPoints: parsed.minPoints,
    maxPoints: parsed.maxPoints,
    search: parsed.search,
    limit: parsed.limit,
    cursor: parsed.cursor,
  };
  return listTasks(ctx, filters);
}

export async function handleGetTask(args: unknown) {
  const { taskId } = getTaskSchema.parse(args);
  const ctx = getContext();
  return getTask(ctx, taskId);
}

export async function handleCreateTask(args: unknown) {
  const parsed = createTaskSchema.parse(args);
  const ctx = getContext();
  const input: CreateTaskInput = {
    title: parsed.title,
    description: parsed.description,
    definitionOfDone: parsed.definitionOfDone,
    points: parsed.points,
    urgency: parsed.urgency,
    risk: parsed.risk,
    status: parsed.status,
    type: parsed.type,
    parentId: parsed.parentId,
    dueDate: parsed.dueDate,
    assigneeId: parsed.assigneeId,
    tags: parsed.tags,
    dependencyIds: parsed.dependencyIds,
  };
  return createTask(ctx, input);
}

export async function handleUpdateTask(args: unknown) {
  const parsed = updateTaskSchema.parse(args);
  const { taskId, ...rest } = parsed;
  const ctx = getContext();
  const input: UpdateTaskInput = {
    title: rest.title,
    description: rest.description,
    definitionOfDone: rest.definitionOfDone,
    points: rest.points,
    urgency: rest.urgency,
    risk: rest.risk,
    status: rest.status,
    type: rest.type,
    parentId: rest.parentId,
    dueDate: rest.dueDate,
    assigneeId: rest.assigneeId,
    tags: rest.tags,
    dependencyIds: rest.dependencyIds,
  };
  return updateTask(ctx, taskId, input);
}

export async function handleDeleteTask(args: unknown) {
  const { taskId } = deleteTaskSchema.parse(args);
  const ctx = getContext();
  return deleteTask(ctx, taskId);
}

export const taskTools = [
  {
    name: "list_tasks",
    description:
      "List tasks with optional filtering. Supports filtering by status, type, urgency, risk, tags, assignee, due date range, points range, and text search. Results are paginated.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "array",
          items: { type: "string", enum: TASK_STATUS_VALUES },
          description: "Filter by task status (BACKLOG, SPRINT, DONE)",
        },
        type: {
          type: "array",
          items: { type: "string", enum: TASK_TYPE_VALUES },
          description: "Filter by task type (EPIC, PBI, TASK, ROUTINE)",
        },
        urgency: {
          type: "string",
          enum: SEVERITY_VALUES,
          description: "Filter by urgency (LOW, MEDIUM, HIGH)",
        },
        risk: {
          type: "string",
          enum: SEVERITY_VALUES,
          description: "Filter by risk (LOW, MEDIUM, HIGH)",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Filter by tags (matches any)",
        },
        assigneeId: { type: "string", description: "Filter by assignee user ID" },
        dueBefore: {
          type: "string",
          description: "Filter tasks due before this date (ISO 8601)",
        },
        dueAfter: {
          type: "string",
          description: "Filter tasks due after this date (ISO 8601)",
        },
        minPoints: { type: "number", description: "Minimum story points" },
        maxPoints: { type: "number", description: "Maximum story points" },
        search: {
          type: "string",
          description: "Search text in title and description",
        },
        limit: {
          type: "number",
          description: "Maximum number of results (default 200, max 500)",
        },
        cursor: {
          type: "string",
          description: "Cursor for pagination (task ID)",
        },
      },
    },
    handler: handleListTasks,
  },
  {
    name: "get_task",
    description: "Get a single task by ID with full details including dependencies",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "Task ID" },
      },
      required: ["taskId"],
    },
    handler: handleGetTask,
  },
  {
    name: "create_task",
    description:
      "Create a new task. Points must be Fibonacci numbers (1,2,3,5,8,13,21,34). Tasks can be created in BACKLOG or SPRINT status.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Task title" },
        description: { type: "string", description: "Task description" },
        definitionOfDone: {
          type: "string",
          description: "Definition of done criteria",
        },
        points: {
          type: "number",
          description: "Story points (1,2,3,5,8,13,21,34)",
        },
        urgency: {
          type: "string",
          enum: SEVERITY_VALUES,
          description: "Urgency level (default: MEDIUM)",
        },
        risk: {
          type: "string",
          enum: SEVERITY_VALUES,
          description: "Risk level (default: MEDIUM)",
        },
        status: {
          type: "string",
          enum: TASK_STATUS_VALUES,
          description: "Initial status (default: BACKLOG)",
        },
        type: {
          type: "string",
          enum: TASK_TYPE_VALUES,
          description: "Task type (default: PBI)",
        },
        parentId: { type: "string", description: "Parent task ID for subtasks" },
        dueDate: {
          type: "string",
          description: "Due date (ISO 8601 format)",
        },
        assigneeId: { type: "string", description: "Assignee user ID" },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Task tags",
        },
        dependencyIds: {
          type: "array",
          items: { type: "string" },
          description: "IDs of tasks this task depends on",
        },
      },
      required: ["title", "points"],
    },
    handler: handleCreateTask,
  },
  {
    name: "update_task",
    description:
      "Update an existing task. All fields are optional. Changing status to SPRINT checks capacity. Moving requires dependencies to be DONE.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "Task ID to update" },
        title: { type: "string", description: "New title" },
        description: { type: "string", description: "New description" },
        definitionOfDone: { type: "string", description: "New definition of done" },
        points: {
          type: "number",
          description: "New story points (1,2,3,5,8,13,21,34)",
        },
        urgency: {
          type: "string",
          enum: SEVERITY_VALUES,
          description: "New urgency level",
        },
        risk: {
          type: "string",
          enum: SEVERITY_VALUES,
          description: "New risk level",
        },
        status: {
          type: "string",
          enum: TASK_STATUS_VALUES,
          description: "New status",
        },
        type: {
          type: "string",
          enum: TASK_TYPE_VALUES,
          description: "New task type",
        },
        parentId: {
          type: ["string", "null"],
          description: "New parent task ID or null to clear",
        },
        dueDate: {
          type: ["string", "null"],
          description: "New due date or null to clear",
        },
        assigneeId: {
          type: ["string", "null"],
          description: "New assignee or null to clear",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "New tags (replaces existing)",
        },
        dependencyIds: {
          type: "array",
          items: { type: "string" },
          description: "New dependency IDs (replaces existing)",
        },
      },
      required: ["taskId"],
    },
    handler: handleUpdateTask,
  },
  {
    name: "delete_task",
    description: "Delete a task. Also removes dependencies and AI suggestions associated with it.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "Task ID to delete" },
      },
      required: ["taskId"],
    },
    handler: handleDeleteTask,
  },
];
