import { createApplyAiTaskCommand } from "./application/apply-ai-task-command";
import { createBulkTaskCommand } from "./application/bulk-task-command";
import { createTaskCommands } from "./application/task-commands";
import { createTaskCommentCommands } from "./application/task-comment-commands";
import { createTaskQueries } from "./application/task-queries";
import { prismaApplyAiTaskCommandPort } from "./infrastructure/prisma-apply-ai-task-command";
import { prismaBulkTaskCommandPort } from "./infrastructure/prisma-bulk-task-command";
import { prismaTaskCommandPort } from "./infrastructure/prisma-task-command-port";
import { prismaTaskCommentCommandPort } from "./infrastructure/prisma-task-comments";
import { prismaTaskQueryPort } from "./infrastructure/prisma-task-query-port";

const commands = createTaskCommands(prismaTaskCommandPort);
const comments = createTaskCommentCommands(prismaTaskCommentCommandPort);
const queries = createTaskQueries(prismaTaskQueryPort);

export const createTask = commands.create;
export const updateTask = commands.update;
export const deleteTask = commands.delete;
export const bulkUpdateTasks = createBulkTaskCommand(prismaBulkTaskCommandPort);
export const applyAiTaskChange = createApplyAiTaskCommand(prismaApplyAiTaskCommandPort);
export const listTasks = queries.list;
export const getTask = queries.get;
export const listTaskComments = comments.list;
export const createTaskComment = comments.create;
export const updateTaskComment = comments.update;
export const deleteTaskComment = comments.delete;

export type { TaskCommentRecord } from "./application/task-comment-types";
export type { CreateTaskInput, TaskRecord, UpdateTaskInput } from "./application/task-types";
