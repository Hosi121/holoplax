import { TaskType } from "@prisma/client";
import { requireAuth } from "../../../../lib/api-auth";
import { handleAuthError, ok } from "../../../../lib/api-response";
import { logAudit } from "../../../../lib/audit";
import { IntakeResolveSchema } from "../../../../lib/contracts/intake";
import { createDomainErrors, errorResponse } from "../../../../lib/http/errors";
import { parseBody } from "../../../../lib/http/validation";
import prisma from "../../../../lib/prisma";
import { TASK_STATUS, TASK_TYPE } from "../../../../lib/types";

const errors = createDomainErrors("INTAKE");

export async function POST(request: Request) {
  try {
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
      const targetTask = await prisma.task.findFirst({
        where: { id: targetTaskId, workspaceId },
      });
      if (!targetTask) {
        return errors.badRequest("invalid targetTaskId");
      }
      const appendix = `\n\n---\nInbox取り込み:\n${intakeItem.body}`;
      await prisma.task.update({
        where: { id: targetTaskId },
        data: {
          description: `${targetTask.description ?? ""}${appendix}`,
        },
      });
      await prisma.intakeItem.update({
        where: { id: intakeId },
        data: {
          status: "CONVERTED",
          workspaceId,
          taskId: targetTaskId,
        },
      });
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
      const task = await prisma.task.create({
        data: {
          title: intakeItem.title,
          description: intakeItem.body,
          points: 3,
          urgency: "中",
          risk: "中",
          status: TASK_STATUS.BACKLOG,
          type: typeValue,
          user: { connect: { id: userId } },
          workspace: { connect: { id: workspaceId } },
        },
      });
      await prisma.intakeItem.update({
        where: { id: intakeId },
        data: {
          status: "CONVERTED",
          workspaceId,
          taskId: task.id,
        },
      });
      await logAudit({
        actorId: userId,
        action: "INTAKE_CREATE",
        targetWorkspaceId: workspaceId,
        metadata: { intakeId, taskId: task.id },
      });
      return ok({ taskId: task.id });
    }

    return errors.badRequest("invalid action");
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    console.error("POST /api/intake/resolve error", error);
    return errorResponse(error, {
      code: "INTAKE_INTERNAL",
      message: "failed to resolve intake item",
      status: 500,
    });
  }
}
