import { Prisma, type TaskType } from "@prisma/client";
import { logAudit } from "../audit";
import { applyAutomationForTask } from "../automation";
import { AppError, HTTP_STATUS } from "../http/errors";
import { deriveIntakeTitle, findDuplicateTasks } from "../intake-helpers";
import prisma from "../prisma";
import { SEVERITY, TASK_STATUS, TASK_TYPE } from "../types";

const badRequest = (message: string) =>
  new AppError("INTAKE_BAD_REQUEST", message, HTTP_STATUS.BAD_REQUEST);
const conflict = (message: string) =>
  new AppError("INTAKE_CONFLICT", message, HTTP_STATUS.CONFLICT);

export async function listIntakeItems(params: { userId: string; workspaceId: string | null }) {
  const { userId, workspaceId } = params;
  const [globalItems, workspaceItems] = await Promise.all([
    prisma.intakeItem.findMany({
      where: { userId, workspaceId: null, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    workspaceId
      ? prisma.intakeItem.findMany({
          where: { workspaceId, status: "PENDING" },
          orderBy: { createdAt: "desc" },
          take: 100,
        })
      : Promise.resolve([]),
  ]);
  return { currentWorkspaceId: workspaceId, globalItems, workspaceItems };
}

export async function createIntakeMemo(params: {
  userId: string;
  workspaceId: string | null;
  text: string;
}) {
  const { userId, workspaceId, text } = params;
  const title = deriveIntakeTitle(text);
  const item = await prisma.intakeItem.create({
    data: {
      origin: "MEMO",
      status: "PENDING",
      title,
      body: text,
      user: { connect: { id: userId } },
      workspace: workspaceId ? { connect: { id: workspaceId } } : undefined,
    },
  });
  const duplicates = workspaceId ? await findDuplicateTasks({ workspaceId, title }) : [];
  await logAudit({
    actorId: userId,
    action: "INTAKE_MEMO_CREATE",
    targetWorkspaceId: workspaceId ?? undefined,
    metadata: { itemId: item.id },
  });
  return { item, duplicates };
}

const ensureWorkspaceMembership = async (userId: string, workspaceId: string) => {
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { workspaceId: true },
  });
  if (!membership) throw badRequest("invalid workspaceId");
};

export type ResolveIntakeInput = {
  intakeId: string;
  action: "dismiss" | "merge" | "create";
  workspaceId?: string | null;
  taskType?: TaskType | null;
  targetTaskId?: string | null;
};

export async function resolveIntakeItem(params: { userId: string; input: ResolveIntakeInput }) {
  const { userId, input } = params;
  const intakeItem = await prisma.intakeItem.findUnique({ where: { id: input.intakeId } });
  if (!intakeItem) throw badRequest("invalid intakeId");

  const isOwner = intakeItem.userId === userId;
  const itemMembership =
    !isOwner && intakeItem.workspaceId
      ? await prisma.workspaceMember.findUnique({
          where: {
            workspaceId_userId: { workspaceId: intakeItem.workspaceId, userId },
          },
          select: { workspaceId: true },
        })
      : null;
  if (!isOwner && !itemMembership) throw badRequest("not allowed");

  if (input.action === "dismiss") {
    const dismissed = await prisma.intakeItem.updateMany({
      where: { id: input.intakeId, status: "PENDING" },
      data: { status: "DISMISSED" },
    });
    if (!dismissed.count) throw conflict("intake item already converted or dismissed");
    return { status: "DISMISSED" as const };
  }

  const workspaceId = input.workspaceId;
  if (!workspaceId) throw badRequest("workspaceId is required");
  await ensureWorkspaceMembership(userId, workspaceId);

  if (input.action === "merge") {
    const targetTaskId = input.targetTaskId;
    if (!targetTaskId) throw badRequest("targetTaskId is required");
    const appendix = `\n\n---\nInbox取り込み:\n${intakeItem.body}`;
    const merged = await prisma.$transaction(async (tx) => {
      const guard = await tx.intakeItem.updateMany({
        where: { id: input.intakeId, status: "PENDING" },
        data: { status: "CONVERTED", workspaceId, taskId: targetTaskId },
      });
      if (!guard.count) return false;
      // Concatenate inside PostgreSQL so concurrent merges into the same task
      // cannot overwrite each other's description.
      const updated = await tx.$executeRaw(
        Prisma.sql`UPDATE "Task"
          SET "description" = COALESCE("description", '') || ${appendix},
              "updatedAt" = NOW()
          WHERE "id" = ${targetTaskId} AND "workspaceId" = ${workspaceId}`,
      );
      if (!updated) throw badRequest("invalid targetTaskId");
      return true;
    });
    if (!merged) throw conflict("intake item already converted or dismissed");
    await logAudit({
      actorId: userId,
      action: "INTAKE_MERGE",
      targetWorkspaceId: workspaceId,
      metadata: { intakeId: input.intakeId, taskId: targetTaskId },
    });
    return { taskId: targetTaskId };
  }

  if (input.action === "create") {
    const type = Object.values(TASK_TYPE).includes(input.taskType as TaskType)
      ? (input.taskType as TaskType)
      : TASK_TYPE.PBI;
    const task = await prisma.$transaction(async (tx) => {
      const guard = await tx.intakeItem.updateMany({
        where: { id: input.intakeId, status: "PENDING" },
        data: { status: "CONVERTED", workspaceId },
      });
      if (!guard.count) return null;
      const created = await tx.task.create({
        data: {
          title: intakeItem.title,
          description: intakeItem.body,
          points: 3,
          urgency: SEVERITY.MEDIUM,
          risk: SEVERITY.MEDIUM,
          status: TASK_STATUS.BACKLOG,
          type,
          user: { connect: { id: userId } },
          workspace: { connect: { id: workspaceId } },
          statusEvents: {
            create: {
              fromStatus: null,
              toStatus: TASK_STATUS.BACKLOG,
              actorId: userId,
              trigger: "API",
              workspaceId,
            },
          },
        },
      });
      await tx.intakeItem.update({
        where: { id: input.intakeId },
        data: { taskId: created.id },
      });
      return created;
    });
    if (!task) throw conflict("intake item already converted or dismissed");
    await logAudit({
      actorId: userId,
      action: "INTAKE_CREATE",
      targetWorkspaceId: workspaceId,
      metadata: { intakeId: input.intakeId, taskId: task.id },
    });
    await applyAutomationForTask({
      userId,
      workspaceId,
      task: {
        id: task.id,
        title: task.title,
        description: task.description ?? "",
        points: task.points,
        status: task.status,
      },
    });
    return { taskId: task.id };
  }

  throw badRequest("invalid action");
}
