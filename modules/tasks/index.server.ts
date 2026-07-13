import { createApplyAiTaskCommand } from "./application/apply-ai-task-command";
import { createBulkTaskCommand } from "./application/bulk-task-command";
import { createConvertIntakeTaskCommand } from "./application/convert-intake-task-command";
import { createPendingTaskSplitCommand } from "./application/pending-task-split-command";
import { createRejectPendingTaskSplitCommand } from "./application/reject-pending-task-split-command";
import { createTaskCommands } from "./application/task-commands";
import { createTaskCommentCommands } from "./application/task-comment-commands";
import { createTaskQueries } from "./application/task-queries";
import { prismaApplyAiTaskCommandPort } from "./infrastructure/prisma-apply-ai-task-command";
import { prismaBulkTaskCommandPort } from "./infrastructure/prisma-bulk-task-command";
import { prismaConvertIntakeTaskCommandPort } from "./infrastructure/prisma-convert-intake-task-command";
import { prismaPendingTaskSplitCommandPort } from "./infrastructure/prisma-pending-task-split-command";
import { prismaRejectPendingTaskSplitCommandPort } from "./infrastructure/prisma-reject-pending-task-split-command";
import {
  getTaskAutomationQueueStatus,
  processTaskAutomationJobs,
  retryFailedTaskAutomationJobs,
  startTaskAutomationWorker,
  wakeTaskAutomationWorker,
} from "./infrastructure/prisma-task-automation-jobs";
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
export const convertIntakeItemToTask = createConvertIntakeTaskCommand(
  prismaConvertIntakeTaskCommandPort,
);
export const applyAiTaskChange = createApplyAiTaskCommand(prismaApplyAiTaskCommandPort);
export const applyPendingTaskSplit = createPendingTaskSplitCommand(
  prismaPendingTaskSplitCommandPort,
);
export const rejectPendingTaskSplit = createRejectPendingTaskSplitCommand(
  prismaRejectPendingTaskSplitCommandPort,
);
export const listTasks = queries.list;
export const getTask = queries.get;
export const runPendingTaskAutomation = processTaskAutomationJobs;
export const retryFailedTaskAutomation = retryFailedTaskAutomationJobs;
export const getTaskAutomationStatus = getTaskAutomationQueueStatus;
export const startDurableTaskAutomationWorker = startTaskAutomationWorker;
export const wakeDurableTaskAutomationWorker = wakeTaskAutomationWorker;
export const listTaskComments = comments.list;
export const createTaskComment = comments.create;
export const updateTaskComment = comments.update;
export const deleteTaskComment = comments.delete;

export type { TaskCommentRecord } from "./application/task-comment-types";
export type { CreateTaskInput, TaskRecord, UpdateTaskInput } from "./application/task-types";
