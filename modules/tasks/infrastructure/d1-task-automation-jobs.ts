import type { Db, Task } from "../../../database/models";
import db from "../../../lib/db";
import { logger } from "../../../lib/logger";
import { applyAutomationForTask } from "./d1-task-automation";

type Tx = Db.TransactionClient;

const MAX_ATTEMPTS = 5;
const STALE_AFTER_MS = 5 * 60 * 1000;
const HEARTBEAT_MS = 60 * 1000;

type AutomationJobTask = Pick<
  Task,
  "id" | "title" | "description" | "points" | "workflowState" | "updatedAt"
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
  return tx.taskAutomationJob
    .updateMany({
      where: {
        taskId: input.task.id,
        status: "PENDING",
        dedupeKey: { not: dedupeKey },
      },
      data: { status: "CANCELED" },
    })
    .then(() =>
      tx.taskAutomationJob.upsert({
        where: { dedupeKey },
        create: {
          dedupeKey,
          taskId: input.task.id,
          taskKey: input.task.id,
          workspaceId: input.workspaceId,
          requestedById: input.requestedById,
        },
        update: {},
      }),
    );
};

const reconcileInterruptedTask = async (job: {
  taskId: string | null;
  workspaceId: string;
  createdAt: Date;
}) => {
  if (!job.taskId) return;
  const task = await db.task.findFirst({
    where: { id: job.taskId, workspaceId: job.workspaceId },
    select: { automationStatus: true, hierarchyRole: true },
  });
  if (!task || task.automationStatus === "NONE" || task.automationStatus === "SPLIT_REJECTED") {
    return;
  }
  const completedSideEffect =
    task.automationStatus === "PREPARED"
      ? await db.aiPrepOutput.count({
          where: { taskId: job.taskId, createdAt: { gte: job.createdAt } },
        })
      : await db.aiSuggestion.count({
          where: {
            taskId: job.taskId,
            workspaceId: job.workspaceId,
            type: "SPLIT",
            createdAt: { gte: job.createdAt },
          },
        });
  if (completedSideEffect > 0) return;
  await db.task.updateMany({
    where: {
      id: job.taskId,
      workspaceId: job.workspaceId,
      automationStatus: task.automationStatus,
    },
    data: {
      automationStatus: "NONE",
    },
  });
};

const failJob = async (jobId: string, workerId: string, attempts: number, error: unknown) => {
  const terminal = attempts >= MAX_ATTEMPTS;
  const delayMs = Math.min(60_000, 1000 * 2 ** Math.max(0, attempts - 1));
  const message = error instanceof Error ? error.message : String(error);
  await db.taskAutomationJob.updateMany({
    // A stale worker must never overwrite a claim that has already been
    // recovered and assigned to another worker.
    where: { id: jobId, status: "RUNNING", lockedBy: workerId },
    data: {
      status: terminal ? "FAILED" : "PENDING",
      availableAt: terminal ? new Date() : new Date(Date.now() + delayMs),
      lockedAt: null,
      lockedBy: null,
      lastError: message.slice(0, 4000),
    },
  });
};

const startHeartbeat = (jobId: string, workerId: string) => {
  let pending = Promise.resolve();
  const timer = setInterval(() => {
    pending = pending
      .then(async () => {
        await db.taskAutomationJob.updateMany({
          where: { id: jobId, status: "RUNNING", lockedBy: workerId },
          data: { lockedAt: new Date() },
        });
      })
      .catch((error) => logger.error("TASK_AUTOMATION_JOB heartbeat failed", { jobId }, error));
  }, HEARTBEAT_MS);
  return async () => {
    clearInterval(timer);
    await pending;
  };
};

export const processTaskAutomationJobs = async (
  options: { limit?: number; workspaceId?: string } = {},
) => {
  const limit = Math.min(50, Math.max(1, Math.trunc(options.limit ?? 5)));
  const workerId = crypto.randomUUID();
  const now = new Date();
  await db.taskAutomationJob.updateMany({
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
    const job = await db.command(async (tx) => {
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
    const stopHeartbeat = startHeartbeat(job.id, workerId);

    try {
      await reconcileInterruptedTask(job);
      const task = job.taskId
        ? await db.task.findFirst({ where: { id: job.taskId, workspaceId: job.workspaceId } })
        : null;
      const requestedById = job.requestedById ?? task?.userId;
      if (!task || !requestedById) {
        await db.taskAutomationJob.updateMany({
          where: { id: job.id, status: "RUNNING", lockedBy: workerId },
          data: { status: "CANCELED", lockedAt: null, lockedBy: null },
        });
        continue;
      }
      if (job.dedupeKey !== `${task.id}:${task.updatedAt.toISOString()}`) {
        await db.taskAutomationJob.updateMany({
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
        },
      });
      const completed = await db.taskAutomationJob.updateMany({
        where: { id: job.id, status: "RUNNING", lockedBy: workerId },
        data: { status: "SUCCEEDED", lockedAt: null, lockedBy: null, lastError: null },
      });
      if (completed.count) succeeded += 1;
    } catch (error) {
      failed += 1;
      logger.error("TASK_AUTOMATION_JOB failed", { jobId: job.id, taskId: job.taskId }, error);
      await failJob(job.id, workerId, job.attempts, error);
    } finally {
      await stopHeartbeat();
    }
  }
  return { processed, succeeded, failed };
};

/** Explicit operator recovery for terminal jobs after the provider is fixed. */
export const retryFailedTaskAutomationJobs = async (limit = 25) => {
  const take = Math.min(100, Math.max(1, Math.trunc(limit)));
  const failed = await db.taskAutomationJob.findMany({
    where: { status: "FAILED" },
    orderBy: { updatedAt: "asc" },
    take,
    select: { id: true },
  });
  if (!failed.length) return 0;
  const retried = await db.taskAutomationJob.updateMany({
    where: { id: { in: failed.map(({ id }) => id) }, status: "FAILED" },
    data: {
      status: "PENDING",
      attempts: 0,
      availableAt: new Date(),
      lockedAt: null,
      lockedBy: null,
      lastError: null,
    },
  });
  return retried.count;
};

export const getTaskAutomationQueueStatus = async () => {
  const [groups, oldestPending] = await Promise.all([
    db.taskAutomationJob.groupBy({ by: ["status"], _count: { _all: true } }),
    db.taskAutomationJob.findFirst({
      where: { status: "PENDING" },
      orderBy: { availableAt: "asc" },
      select: { availableAt: true },
    }),
  ]);
  const counts = Object.fromEntries(groups.map(({ status, _count }) => [status, _count._all]));
  return {
    pending: counts.PENDING ?? 0,
    running: counts.RUNNING ?? 0,
    failed: counts.FAILED ?? 0,
    oldestPendingAt: oldestPending?.availableAt ?? null,
  };
};

/** Notify the native queue after the D1 command has committed. */
export { notifyJobs as wakeTaskAutomationWorker } from "../../../server/jobs";
