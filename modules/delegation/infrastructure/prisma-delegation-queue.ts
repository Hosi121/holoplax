import type { Prisma } from "@prisma/client";
import prisma from "../../../lib/prisma";
import type { DelegationExecutionJob, DelegationQueuePort } from "../application/delegation-runner";
import type { DelegationVerification } from "../application/delegation-types";
import type { DelegationPlan } from "../domain/delegation-policy";

const MAX_ATTEMPTS = 3;
const STALE_AFTER_MS = 5 * 60 * 1000;

const toExecutionJob = (row: {
  id: string;
  userId: string;
  workspaceId: string | null;
  request: string;
  mode: DelegationExecutionJob["mode"];
  kind: DelegationExecutionJob["kind"];
  plan: Prisma.JsonValue;
  attempts: number;
}): DelegationExecutionJob => ({
  ...row,
  plan: row.plan as DelegationPlan,
});

const verificationJson = (verification: DelegationVerification) =>
  verification as Prisma.InputJsonValue;

export const prismaDelegationQueuePort: DelegationQueuePort = {
  recoverStale() {
    return prisma.delegationJob
      .updateMany({
        where: {
          status: "RUNNING",
          lockedAt: { lt: new Date(Date.now() - STALE_AFTER_MS) },
        },
        data: {
          status: "PENDING",
          availableAt: new Date(),
          lockedAt: null,
          lockedBy: null,
        },
      })
      .then(({ count }) => count);
  },

  claimNext(workerId) {
    return prisma.$transaction(async (tx) => {
      const candidate = await tx.delegationJob.findFirst({
        where: { status: "PENDING", availableAt: { lte: new Date() } },
        orderBy: [{ availableAt: "asc" }, { createdAt: "asc" }],
      });
      if (!candidate) return null;
      const claimedAt = new Date();
      const claimed = await tx.delegationJob.updateMany({
        where: { id: candidate.id, status: "PENDING", availableAt: { lte: claimedAt } },
        data: {
          status: "RUNNING",
          attempts: { increment: 1 },
          lockedAt: claimedAt,
          lockedBy: workerId,
          startedAt: candidate.startedAt ?? claimedAt,
        },
      });
      if (!claimed.count) return null;
      return toExecutionJob({ ...candidate, attempts: candidate.attempts + 1 });
    });
  },

  complete(jobId, workerId, result, verification) {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.delegationJob.updateMany({
        where: { id: jobId, status: "RUNNING", lockedBy: workerId },
        data: {
          status: "SUCCEEDED",
          result,
          verification: verificationJson(verification),
          lastError: null,
          lockedAt: null,
          lockedBy: null,
          completedAt: new Date(),
        },
      });
      if (updated.count) {
        const job = await tx.delegationJob.findUnique({ where: { id: jobId } });
        if (job) {
          await tx.auditLog.create({
            data: {
              actorId: job.userId,
              action: "DELEGATION_SUCCEEDED",
              targetWorkspaceId: job.workspaceId,
              metadata: { delegationJobId: job.id, verification: verification.summary },
            },
          });
        }
      }
      return updated.count === 1;
    });
  },

  requestInput(jobId, workerId, result, verification) {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.delegationJob.updateMany({
        where: { id: jobId, status: "RUNNING", lockedBy: workerId },
        data: {
          status: "NEEDS_INPUT",
          result,
          verification: verificationJson(verification),
          lastError: verification.summary,
          lockedAt: null,
          lockedBy: null,
        },
      });
      if (updated.count) {
        const job = await tx.delegationJob.findUnique({ where: { id: jobId } });
        if (job) {
          await tx.auditLog.create({
            data: {
              actorId: job.userId,
              action: "DELEGATION_NEEDS_INPUT",
              targetWorkspaceId: job.workspaceId,
              metadata: { delegationJobId: job.id, issues: verification.issues },
            },
          });
        }
      }
      return updated.count === 1;
    });
  },

  async fail(job, workerId, error) {
    const terminal = job.attempts >= MAX_ATTEMPTS;
    const message = error instanceof Error ? error.message : String(error);
    const delayMs = Math.min(30_000, 1000 * 2 ** Math.max(0, job.attempts - 1));
    await prisma.$transaction(async (tx) => {
      const updated = await tx.delegationJob.updateMany({
        where: { id: job.id, status: "RUNNING", lockedBy: workerId },
        data: {
          status: terminal ? "FAILED" : "PENDING",
          availableAt: terminal ? new Date() : new Date(Date.now() + delayMs),
          lastError: message.slice(0, 4000),
          lockedAt: null,
          lockedBy: null,
          completedAt: terminal ? new Date() : null,
        },
      });
      if (updated.count && terminal) {
        await tx.auditLog.create({
          data: {
            actorId: job.userId,
            action: "DELEGATION_FAILED",
            targetWorkspaceId: job.workspaceId,
            metadata: { delegationJobId: job.id, attempts: job.attempts },
          },
        });
      }
    });
  },
};
