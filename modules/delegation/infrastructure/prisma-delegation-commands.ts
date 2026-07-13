import type { Prisma, DelegationJob as PrismaDelegationJob } from "@prisma/client";
import prisma from "../../../lib/prisma";
import { ApplicationError } from "../../shared/application/application-error";
import type { DelegationAction, DelegationCommandPort } from "../application/delegation-commands";
import type { DelegationJob, DelegationVerification } from "../application/delegation-types";
import type { DelegationPlan } from "../domain/delegation-policy";

const notFound = () =>
  new ApplicationError("DELEGATION_NOT_FOUND", "delegated work was not found", "not_found");
const conflict = (message: string) =>
  new ApplicationError("DELEGATION_CONFLICT", message, "conflict");

const asPlan = (value: Prisma.JsonValue) => value as DelegationPlan;
const asVerification = (value: Prisma.JsonValue | null) =>
  value ? (value as DelegationVerification) : null;

const toJob = (row: PrismaDelegationJob): DelegationJob => ({
  id: row.id,
  request: row.request,
  mode: row.mode,
  kind: row.kind,
  risk: row.risk,
  status: row.status,
  approvalReason: row.approvalReason,
  plan: asPlan(row.plan),
  result: row.result,
  verification: asVerification(row.verification),
  lastError: row.lastError,
  attempts: row.attempts,
  createdAt: row.createdAt,
  startedAt: row.startedAt,
  completedAt: row.completedAt,
});

const auditAction = (action: DelegationAction) =>
  action === "cancel"
    ? "DELEGATION_CANCELED"
    : action === "prepare"
      ? "DELEGATION_PREPARE_APPROVED"
      : "DELEGATION_RETRIED";

export const prismaDelegationCommandPort: DelegationCommandPort = {
  async create({ actor, request, mode, plan }) {
    if (plan.decision.outcome === "BLOCK") {
      throw new ApplicationError("DELEGATION_SENSITIVE_INPUT", plan.decision.reason, "bad_request");
    }
    const autoStarted = plan.decision.outcome === "AUTO";
    const job = await prisma.$transaction(async (tx) => {
      const created = await tx.delegationJob.create({
        data: {
          userId: actor.userId,
          workspaceId: actor.workspaceId,
          request,
          mode,
          kind: plan.kind,
          risk: plan.risk,
          status: autoStarted ? "PENDING" : "NEEDS_APPROVAL",
          approvalReason: plan.decision.outcome === "REVIEW" ? plan.decision.reason : null,
          plan: plan as Prisma.InputJsonValue,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.userId,
          action: "DELEGATION_CREATED",
          targetWorkspaceId: actor.workspaceId,
          metadata: {
            delegationJobId: created.id,
            mode,
            kind: plan.kind,
            risk: plan.risk,
            autoStarted,
          },
        },
      });
      return created;
    });
    return toJob(job);
  },

  async list(actor) {
    const rows = await prisma.delegationJob.findMany({
      where: { userId: actor.userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
    });
    return rows.map(toJob);
  },

  async find(actor, jobId) {
    const row = await prisma.delegationJob.findFirst({
      where: { id: jobId, userId: actor.userId },
    });
    return row ? toJob(row) : null;
  },

  async act(actor, jobId, action, preparePlan) {
    return prisma.$transaction(async (tx) => {
      const current = await tx.delegationJob.findFirst({
        where: { id: jobId, userId: actor.userId },
      });
      if (!current) throw notFound();

      if (action === "cancel" && current.status === "CANCELED") return toJob(current);
      if (action === "cancel") {
        if (["SUCCEEDED", "FAILED"].includes(current.status)) {
          throw conflict("completed work cannot be canceled");
        }
        await tx.delegationJob.update({
          where: { id: current.id },
          data: {
            status: "CANCELED",
            lockedAt: null,
            lockedBy: null,
            completedAt: new Date(),
          },
        });
      } else if (action === "prepare") {
        const currentPlan = asPlan(current.plan);
        if (
          current.status !== "NEEDS_APPROVAL" ||
          currentPlan.decision.outcome !== "REVIEW" ||
          currentPlan.decision.safeFallback !== "PREPARE" ||
          !preparePlan
        ) {
          throw conflict("this work is not waiting for preparation approval");
        }
        await tx.delegationJob.update({
          where: { id: current.id },
          data: {
            mode: "PREPARE",
            kind: preparePlan.kind,
            risk: preparePlan.risk,
            status: "PENDING",
            approvalReason: null,
            plan: preparePlan as Prisma.InputJsonValue,
            availableAt: new Date(),
          },
        });
      } else {
        if (current.status !== "FAILED") {
          throw conflict("only failed work can be retried");
        }
        await tx.delegationJob.update({
          where: { id: current.id },
          data: {
            status: "PENDING",
            attempts: 0,
            availableAt: new Date(),
            lastError: null,
            completedAt: null,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: actor.userId,
          action: auditAction(action),
          targetWorkspaceId: actor.workspaceId,
          metadata: { delegationJobId: current.id },
        },
      });
      return toJob(await tx.delegationJob.findUniqueOrThrow({ where: { id: current.id } }));
    });
  },
};
