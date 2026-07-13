import {
  createTask as createSharedTask,
  deleteTask as deleteSharedTask,
  getTask as getSharedTask,
  listTasks as listSharedTasks,
  type CreateTaskInput as TaskCreateInput,
  type UpdateTaskInput as TaskUpdateInput,
  updateTask as updateSharedTask,
} from "../../../modules/tasks/index.server.js";
import type { ExecutionContext } from "../context.js";
import {
  SEVERITY_VALUES,
  type Severity,
  TASK_STATUS_VALUES,
  TASK_TYPE_VALUES,
  type TaskStatus,
  type TaskType,
} from "../domain.js";

export type CreateTaskInput = TaskCreateInput;
export type UpdateTaskInput = TaskUpdateInput;

export interface TaskFilters {
  status?: string[];
  type?: string[];
  urgency?: string;
  risk?: string;
  tags?: string[];
  assigneeId?: string;
  dueBefore?: string;
  dueAfter?: string;
  minPoints?: number;
  maxPoints?: number;
  search?: string;
  limit?: number;
  cursor?: string;
}

const asDate = (value?: string): Date | undefined => (value ? new Date(value) : undefined);
const isTaskStatus = (value: string): value is TaskStatus =>
  TASK_STATUS_VALUES.includes(value as TaskStatus);
const isTaskType = (value: string): value is TaskType =>
  TASK_TYPE_VALUES.includes(value as TaskType);
const isSeverity = (value?: string): value is Severity =>
  Boolean(value && SEVERITY_VALUES.includes(value as Severity));

export async function listTasks(ctx: ExecutionContext, filters: TaskFilters = {}) {
  return listSharedTasks(ctx.workspaceId, {
    statuses: filters.status?.filter(isTaskStatus),
    types: filters.type?.filter(isTaskType),
    urgency: isSeverity(filters.urgency) ? filters.urgency : undefined,
    risk: isSeverity(filters.risk) ? filters.risk : undefined,
    tags: filters.tags,
    assigneeId: filters.assigneeId,
    dueBefore: asDate(filters.dueBefore),
    dueAfter: asDate(filters.dueAfter),
    minPoints: filters.minPoints,
    maxPoints: filters.maxPoints,
    search: filters.search,
    limit: filters.limit,
    cursor: filters.cursor,
  });
}

export async function getTask(ctx: ExecutionContext, taskId: string) {
  const task = await getSharedTask(ctx.workspaceId, taskId);
  if (!task) throw new Error("Task not found");
  return task;
}

export const createTask = (ctx: ExecutionContext, input: CreateTaskInput) =>
  createSharedTask({ userId: ctx.userId, workspaceId: ctx.workspaceId }, input);

export const updateTask = (ctx: ExecutionContext, taskId: string, input: UpdateTaskInput) =>
  updateSharedTask({ userId: ctx.userId, workspaceId: ctx.workspaceId }, taskId, input);

export async function deleteTask(ctx: ExecutionContext, taskId: string) {
  await deleteSharedTask({ userId: ctx.userId, workspaceId: ctx.workspaceId }, taskId);
  return { ok: true };
}
