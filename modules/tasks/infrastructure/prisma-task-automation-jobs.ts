import type { Prisma, Task } from "@prisma/client";
import { randomUUID } from "crypto";
import { logger } from "../../../lib/logger";
import prisma from "../../../lib/prisma";
import { projectLegacyAutomationState } from "../domain/task-automation";
import { applyAutomationForTask } from "./prisma-task-automation";

type Tx = Prisma.TransactionClient;

const MAX_ATTEMPTS = 5;
const STALE_AFTER_MS = 5 * 60 * 1000;

type AutomationJobTask = Pick<
  Task,
  "id" | "title" | "description" | "points" | "status" | "workflowState" | "updatedAt"
>;

export const enqueueTaskAutomation = (
  tx: Tx,
  input: {
    task: AutomationJobTask;
    workspaceId: string;
    requestedById: string;
  },
) => {
  if (input.task.workflowState === "DONE" || input.task.workflowState === "CANCELED") {
    return Promise.resolve(null);
  }
  const dedupeKey = `${input.task.id}:${input.task.updatedAt.toISOString()}`;
  return tx.taskAutomationJob.upsert({
    where: { dedupeKey },
    create: {
      dedupeKey,
      taskId: input.task.id,
      taskKey: input.task.id,
      workspaceId: input.workspaceId,
      requestedById: input.requestedById,
    },
    update: {},
  });
};

const reconcileInterruptedTask = async (job: {
  taskId: string | null;
  workspaceId: string;
  createdAt: Date;
}) => {
  if (!job.taskId) return;
  const task = await prisma.task.findFirst({
    where: { id: job.taskId, workspaceId: job.workspaceId },
    select: { automationStatus: true, hierarchyRole: true },
  });
  if (!task || task.automationStatus === "NONE" || task.automationStatus === "SPLIT_REJECTED") {
    return;
  }
  const completedSideEffect =
    task.automationStatus === "PREPARED"
      ? await prisma.aiPrepOutput.count({
          where: { taskId: job.taskId, createdAt: { gte: job.createdAt } },
        })
      : await prisma.aiSuggestion.count({
          where: {
            taskId: job.taskId,
            workspaceId: job.workspaceId,
            type: "SPLIT",
            createdAt: { gte: job.createdAt },
          },
        });
  if (completedSideEffect > 0) return;
  await prisma.task.updateMany({
    where: {
      id: job.taskId,
      workspaceId: job.workspaceId,
      automationStatus: task.automationStatus,
    },
    data: {
      automationStatus: "NONE",
      automationState: projectLegacyAutomationState({
        automationStatus: "NONE",
        hierarchyRole: task.hierarchyRole,
      }),
    },
  });
};

const failJob = async (jobId: string, attempts: number, error: unknown) => {
  const terminal = attempts >= MAX_ATTEMPTS;
  const delayMs = Math.min(60_000, 1000 * 2 ** Math.max(0, attempts - 1));
  const message = error instanceof Error ? error.message : String(error);
  await prisma.taskAutomationJob.updateMany({
    where: { id: jobId, status: "RUNNING" },
    data: {
      status: terminal ? "FAILED" : "PENDING",
      availableAt: terminal ? new Date() : new Date(Date.now() + delayMs),
      lockedAt: null,
      lockedBy: null,
      lastError: message.slice(0, 4000),
    },
  });
};

export const processTaskAutomationJobs = async (
  options: { limit?: number; workspaceId?: string } = {},
) => {
  const limit = Math.min(50, Math.max(1, Math.trunc(options.limit ?? 5)));
  const workerId = randomUUID();
  const now = new Date();
  await prisma.taskAutomationJob.updateMany({
    where: {
      status: "RUNNING",
      lockedAt: { lt: new Date(now.getTime() - STALE_AFTER_MS) },
      ...(options.workspaceId ? { workspaceId: options.workspaceId } : {}),
    },
    data: { status: "PENDING", lockedAt: null, lockedBy: null, availableAt: now },
  });

  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  while (processed < limit) {
    const job = await prisma.$transaction(async (tx) => {
      const candidate = await tx.taskAutomationJob.findFirst({
        where: {
          status: "PENDING",
          availableAt: { lte: new Date() },
          ...(options.workspaceId ? { workspaceId: options.workspaceId } : {}),
        },
        orderBy: [{ availableAt: "asc" }, { createdAt: "asc" }],
      });
      if (!candidate) return null;
      const claimed = await tx.taskAutomationJob.updateMany({
        where: { id: candidate.id, status: "PENDING", availableAt: { lte: new Date() } },
        data: {
          status: "RUNNING",
          attempts: { increment: 1 },
          lockedAt: new Date(),
          lockedBy: workerId,
        },
      });
      if (!claimed.count) return null;
      return { ...candidate, attempts: candidate.attempts + 1 };
    });
    if (!job) break;
    processed += 1;

    try {
      await reconcileInterruptedTask(job);
      const task = job.taskId
        ? await prisma.task.findFirst({ where: { id: job.taskId, workspaceId: job.workspaceId } })
        : null;
      const requestedById = job.requestedById ?? task?.userId;
      if (!task || !requestedById) {
        await prisma.taskAutomationJob.updateMany({
          where: { id: job.id, status: "RUNNING", lockedBy: workerId },
          data: { status: "CANCELED", lockedAt: null, lockedBy: null },
        });
        continue;
      }
      await applyAutomationForTask({
        userId: requestedById,
        workspaceId: job.workspaceId,
        task: {
          id: task.id,
          title: task.title,
          description: task.description,
          points: task.points,
          status: task.status,
        },
      });
      await prisma.taskAutomationJob.updateMany({
        where: { id: job.id, status: "RUNNING", lockedBy: workerId },
        data: { status: "SUCCEEDED", lockedAt: null, lockedBy: null, lastError: null },
      });
      succeeded += 1;
    } catch (error) {
      failed += 1;
      logger.error("TASK_AUTOMATION_JOB failed", { jobId: job.id, taskId: job.taskId }, error);
      await failJob(job.id, job.attempts, error);
    }
  }
  return { processed, succeeded, failed };
};

export const drainTaskAutomationForWorkspace = (workspaceId: string, limit = 5) =>
  processTaskAutomationJobs({ workspaceId, limit }).catch((error) => {
    logger.error("TASK_AUTOMATION_JOB drain failed", { workspaceId }, error);
    return { processed: 0, succeeded: 0, failed: 1 };
  });
