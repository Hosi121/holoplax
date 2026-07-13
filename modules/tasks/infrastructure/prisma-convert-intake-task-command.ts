import type { Prisma, TaskType } from "@prisma/client";
import prisma from "../../../lib/prisma";
import { SEVERITY, TASK_STATUS, TASK_TYPE } from "../../../lib/types";
import { ApplicationError } from "../../shared/application/application-error";
import type { ConvertIntakeTaskCommandPort } from "../application/convert-intake-task-command";
import {
  drainTaskAutomationForWorkspace,
  enqueueTaskAutomation,
} from "./prisma-task-automation-jobs";
import { persistNewTask } from "./prisma-task-writer";

const badRequest = (message: string) =>
  new ApplicationError("INTAKE_BAD_REQUEST", message, "bad_request");
const conflict = (message: string) => new ApplicationError("INTAKE_CONFLICT", message, "conflict");

export const prismaConvertIntakeTaskCommandPort: ConvertIntakeTaskCommandPort = {
  async execute(actor, command) {
    const task = await prisma.$transaction(async (tx) => {
      const membership = await tx.workspaceMember.findUnique({
        where: {
          workspaceId_userId: {
            workspaceId: command.workspaceId,
            userId: actor.userId,
          },
        },
        select: { workspaceId: true },
      });
      if (!membership) throw badRequest("invalid workspaceId");

      const item = await tx.intakeItem.findUnique({ where: { id: command.intakeId } });
      if (!item) throw badRequest("invalid intakeId");
      if (item.userId !== actor.userId && item.workspaceId !== command.workspaceId) {
        throw badRequest("not allowed");
      }
      const guard = await tx.intakeItem.updateMany({
        where: { id: command.intakeId, status: "PENDING" },
        data: { status: "CONVERTED", workspaceId: command.workspaceId },
      });
      if (!guard.count) return null;

      const metadata =
        item.payload && typeof item.payload === "object" && !Array.isArray(item.payload)
          ? (item.payload as Prisma.JsonObject)
          : {};
      const points =
        typeof metadata.points === "number" && [1, 2, 3, 5, 8, 13, 21, 34].includes(metadata.points)
          ? metadata.points
          : 3;
      const urgency =
        metadata.urgency === "LOW" || metadata.urgency === "HIGH"
          ? metadata.urgency
          : SEVERITY.MEDIUM;
      const dueDate =
        typeof metadata.dueDate === "string" && !Number.isNaN(new Date(metadata.dueDate).getTime())
          ? new Date(metadata.dueDate)
          : null;
      const type = Object.values(TASK_TYPE).includes(command.taskType as TaskType)
        ? (command.taskType as TaskType)
        : TASK_TYPE.PBI;
      const created = await persistNewTask(
        tx,
        {
          title: item.title,
          description: item.body,
          points,
          urgency,
          risk: SEVERITY.MEDIUM,
          status: TASK_STATUS.BACKLOG,
          type,
          dueDate,
          userId: actor.userId,
          workspaceId: command.workspaceId,
          origin: "INTAKE",
        },
        { actorId: actor.userId, trigger: "API" },
      );
      await tx.intakeItem.update({
        where: { id: command.intakeId },
        data: { taskId: created.id },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.userId,
          action: "INTAKE_CREATE",
          targetWorkspaceId: command.workspaceId,
          metadata: { intakeId: item.id, taskId: created.id },
        },
      });
      await enqueueTaskAutomation(tx, {
        task: created,
        workspaceId: command.workspaceId,
        requestedById: actor.userId,
      });
      return created;
    });
    if (!task) throw conflict("intake item already converted or dismissed");

    await drainTaskAutomationForWorkspace(command.workspaceId);
    return { taskId: task.id };
  },
};
