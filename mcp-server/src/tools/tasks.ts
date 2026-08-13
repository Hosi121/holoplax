import { z } from "zod";
import { TaskCreateSchema, TaskUpdateSchema } from "../../../lib/contracts/task.js";
import { getContext } from "../context.js";
import {
  isValidDateString,
  SEVERITY_VALUES,
  TASK_STATUS_VALUES,
  TASK_TYPE_VALUES,
} from "../domain.js";
import {
  createTask,
  deleteTask,
  getTask,
  listTasks,
  type TaskFilters,
  updateTask,
} from "../services/tasks.js";

export const listTasksSchema = z.object({
  status: z.array(z.enum(TASK_STATUS_VALUES)).optional(),
  type: z.array(z.enum(TASK_TYPE_VALUES)).optional(),
  urgency: z.enum(SEVERITY_VALUES).optional(),
  risk: z.enum(SEVERITY_VALUES).optional(),
  tags: z.array(z.string()).optional(),
  assigneeId: z.string().optional(),
  dueBefore: z.string().refine(isValidDateString, "invalid dueBefore").optional(),
  dueAfter: z.string().refine(isValidDateString, "invalid dueAfter").optional(),
  minPoints: z.number().optional(),
  maxPoints: z.number().optional(),
  search: z.string().optional(),
  limit: z.number().int().min(1).max(500).optional(),
  cursor: z.string().optional(),
});

export const getTaskSchema = z.object({ taskId: z.string().min(1, "taskId is required") });
export const createTaskSchema = TaskCreateSchema;
export const updateTaskSchema = TaskUpdateSchema.extend({
  taskId: z.string().min(1, "taskId is required"),
});
export const deleteTaskSchema = getTaskSchema;

export async function handleListTasks(args: unknown) {
  const parsed = listTasksSchema.parse(args);
  const ctx = getContext();
  const filters: TaskFilters = parsed;
  return listTasks(ctx, filters);
}

export async function handleGetTask(args: unknown) {
  const { taskId } = getTaskSchema.parse(args);
  return getTask(getContext(), taskId);
}

export async function handleCreateTask(args: unknown) {
  const input = createTaskSchema.parse(args);
  return createTask(getContext(), input);
}

export async function handleUpdateTask(args: unknown) {
  const { taskId, ...input } = updateTaskSchema.parse(args);
  return updateTask(getContext(), taskId, input);
}

export async function handleDeleteTask(args: unknown) {
  const { taskId } = deleteTaskSchema.parse(args);
  return deleteTask(getContext(), taskId);
}

type McpInputSchema = {
  type: string;
  properties: Record<string, unknown>;
  required?: string[];
};

// Generate the advertised MCP contract from the exact schema used at runtime.
// This removes the former third, hand-maintained copy of every task field.
const toMcpInputSchema = (schema: unknown): McpInputSchema =>
  (
    schema as {
      toJSONSchema(params: { target: string; io: "input" }): unknown;
    }
  ).toJSONSchema({ target: "draft-07", io: "input" }) as McpInputSchema;

export const taskTools = [
  {
    name: "list_tasks",
    description:
      "List tasks with optional filtering by status, type, severity, tags, assignee, dates, points, and text.",
    inputSchema: toMcpInputSchema(listTasksSchema),
    handler: handleListTasks,
  },
  {
    name: "get_task",
    description: "Get a task with its dependencies.",
    inputSchema: toMcpInputSchema(getTaskSchema),
    handler: handleGetTask,
  },
  {
    name: "create_task",
    description: "Create a task. Story points use the supported Fibonacci values.",
    inputSchema: toMcpInputSchema(createTaskSchema),
    handler: handleCreateTask,
  },
  {
    name: "update_task",
    description: "Update a task, its workflow state, planning membership, or related metadata.",
    inputSchema: toMcpInputSchema(updateTaskSchema),
    handler: handleUpdateTask,
  },
  {
    name: "delete_task",
    description: "Delete a task and its owned relations.",
    inputSchema: toMcpInputSchema(deleteTaskSchema),
    handler: handleDeleteTask,
  },
];
