import type { TaskType } from "@prisma/client";
import { requireAuth } from "../../../../lib/api-auth";
import { withApiHandler } from "../../../../lib/api-handler";
import { ok } from "../../../../lib/api-response";
import { logAudit } from "../../../../lib/audit";
import { IntakeResolveSchema } from "../../../../lib/contracts/intake";
import { createDomainErrors } from "../../../../lib/http/errors";
import { parseBody } from "../../../../lib/http/validation";
import prisma from "../../../../lib/prisma";
import { SEVERITY, TASK_STATUS, TASK_TYPE } from "../../../../lib/types";

const errors = createDomainErrors("INTAKE");

export async function POST(request: Request) {
  return withApiHandler(
    {
      logLabel: "POST /api/intake/resolve",
      errorFallback: {
        code: "INTAKE_INTERNAL",
        message: "failed to resolve intake item",
        status: 500,
      },
    },
    async () => {
      const { userId } = await requireAuth();
      const body = await parseBody(request, IntakeResolveSchema, {
        code: "INTAKE_VALIDATION",
      });
      const intakeId = body.intakeId;
      const action = body.action;
      const workspaceId = body.workspaceId ?? null;
      const taskType = body.taskType ?? null;
      const targetTaskId = body.targetTaskId ?? null;

      const intakeItem = await prisma.intakeItem.findFirst({
        where: { id: intakeId },
      });
      if (!intakeItem) {
        return errors.badRequest("invalid intakeId");
      }
      if (intakeItem.userId !== userId && intakeItem.workspaceId !== workspaceId) {
        return errors.badRequest("not allowed");
      }

      if (action === "dismiss") {
        await prisma.intakeItem.update({
          where: { id: intakeId },
          data: { status: "DISMISSED" },
        });
        return ok({ status: "DISMISSED" });
      }

      if (!workspaceId) {
        return errors.badRequest("workspaceId is required");
      }
      const membership = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId } },
        select: { workspaceId: true },
      });
      if (!membership) {
        return errors.badRequest("invalid workspaceId");
      }

      if (action === "merge") {
        if (!targetTaskId) {
          return errors.badRequest("targetTaskId is required");
        }
        // Fetch the target task for its current description before the transaction.
        // If the task is deleted between here and the tx.task.update, Prisma will
        // throw P2025 and the transaction will roll back (intakeItem stays PENDING).
        const targetTask = await prisma.task.findFirst({
          where: { id: targetTaskId, workspaceId },
          select: { description: true },
        });
        if (!targetTask) {
          return errors.badRequest("invalid targetTaskId");
        }
        const appendix = `\n\n---\nInbox取り込み:\n${intakeItem.body}`;
        // Atomic: claim PENDING→CONVERTED and apply the merge in one transaction.
        // The updateMany guard (status:"PENDING") ensures a concurrent duplicate
        // request sees count=0 and aborts before touching the task description.
        const claimed = await prisma.$transaction(async (tx) => {
          const guard = await tx.intakeItem.updateMany({
            where: { id: intakeId, status: "PENDING" },
            data: { status: "CONVERTED", workspaceId, taskId: targetTaskId },
          });
          if (!guard.count) return false;
          await tx.task.update({
            where: { id: targetTaskId },
            data: { description: `${targetTask.description ?? ""}${appendix}` },
          });
          return true;
        });
        if (!claimed) {
          return errors.badRequest("intake item already converted or dismissed");
        }
        await logAudit({
          actorId: userId,
          action: "INTAKE_MERGE",
          targetWorkspaceId: workspaceId,
          metadata: { intakeId, taskId: targetTaskId },
        });
        return ok({ taskId: targetTaskId });
      }

      if (action === "create") {
        const typeValue = Object.values(TASK_TYPE).includes(taskType as TaskType)
          ? (taskType as TaskType)
          : TASK_TYPE.PBI;
        // Atomic: claim PENDING→CONVERTED and create the task in one transaction.
        // The updateMany guard ensures at most one task is ever created per intake
        // item, even under concurrent or duplicate-submit requests.
        const task = await prisma.$transaction(async (tx) => {
          const guard = await tx.intakeItem.updateMany({
            where: { id: intakeId, status: "PENDING" },
            data: { status: "CONVERTED", workspaceId },
          });
          if (!guard.count) return null;
          const newTask = await tx.task.create({
            data: {
              title: intakeItem.title,
              description: intakeItem.body,
              points: 3,
              urgency: SEVERITY.MEDIUM,
              risk: SEVERITY.MEDIUM,
              status: TASK_STATUS.BACKLOG,
              type: typeValue,
              user: { connect: { id: userId } },
              workspace: { connect: { id: workspaceId } },
            },
          });
          await tx.intakeItem.update({
            where: { id: intakeId },
            data: { taskId: newTask.id },
          });
          return newTask;
        });
        if (!task) {
          return errors.badRequest("intake item already converted or dismissed");
        }
        await logAudit({
          actorId: userId,
          action: "INTAKE_CREATE",
          targetWorkspaceId: workspaceId,
          metadata: { intakeId, taskId: task.id },
        });
        return ok({ taskId: task.id });
      }

      return errors.badRequest("invalid action");
    },
  );
}
