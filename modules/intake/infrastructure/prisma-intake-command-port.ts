import { Prisma } from "@prisma/client";
import prisma from "../../../lib/prisma";
import { ApplicationError } from "../../shared/application/application-error";
import type { IntakeCommandPort, IntakeDuplicate } from "../application/intake-types";
import { deriveIntakeTitle, intakeTitleSimilarity } from "../domain/intake-text";

const badRequest = (message: string) =>
  new ApplicationError("INTAKE_BAD_REQUEST", message, "bad_request");
const conflict = (message: string) => new ApplicationError("INTAKE_CONFLICT", message, "conflict");

const findDuplicateTasks = async (
  workspaceId: string,
  title: string,
  limit = 5,
): Promise<IntakeDuplicate[]> => {
  const tasks = await prisma.task.findMany({
    where: { workspaceId },
    select: { id: true, title: true, status: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return tasks
    .map((task) => ({ ...task, score: intakeTitleSimilarity(title, task.title) }))
    .filter((item) => item.score >= 0.35)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
};

const requireMembership = async (
  db: Prisma.TransactionClient | typeof prisma,
  userId: string,
  workspaceId: string,
) => {
  const membership = await db.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { workspaceId: true },
  });
  if (!membership) throw badRequest("invalid workspaceId");
};

const readAccessibleItem = async (
  tx: Prisma.TransactionClient,
  intakeId: string,
  userId: string,
) => {
  const item = await tx.intakeItem.findUnique({ where: { id: intakeId } });
  if (!item) throw badRequest("invalid intakeId");
  if (item.userId === userId) return item;
  if (!item.workspaceId) throw badRequest("not allowed");
  const membership = await tx.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId: item.workspaceId, userId } },
    select: { workspaceId: true },
  });
  if (!membership) throw badRequest("not allowed");
  return item;
};

export const prismaIntakeCommandPort: IntakeCommandPort = {
  async list(actor) {
    const [globalItems, workspaceItems] = await Promise.all([
      prisma.intakeItem.findMany({
        where: { userId: actor.userId, workspaceId: null, status: "PENDING" },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      actor.workspaceId
        ? prisma.intakeItem.findMany({
            where: { workspaceId: actor.workspaceId, status: "PENDING" },
            orderBy: { createdAt: "desc" },
            take: 100,
          })
        : Promise.resolve([]),
    ]);
    return { currentWorkspaceId: actor.workspaceId, globalItems, workspaceItems };
  },

  async createMemo(actor, text) {
    const title = deriveIntakeTitle(text);
    const item = await prisma.$transaction(async (tx) => {
      if (actor.workspaceId) await requireMembership(tx, actor.userId, actor.workspaceId);
      const created = await tx.intakeItem.create({
        data: {
          origin: "MEMO",
          status: "PENDING",
          title,
          body: text,
          userId: actor.userId,
          workspaceId: actor.workspaceId,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.userId,
          action: "INTAKE_MEMO_CREATE",
          targetWorkspaceId: actor.workspaceId,
          metadata: { itemId: created.id },
        },
      });
      return created;
    });
    const duplicates = actor.workspaceId ? await findDuplicateTasks(actor.workspaceId, title) : [];
    return { item, duplicates };
  },

  async analyze(actor, input) {
    await requireMembership(prisma, actor.userId, input.workspaceId);
    const item = await prisma.intakeItem.findUnique({
      where: { id: input.intakeId },
      select: { title: true, userId: true, workspaceId: true },
    });
    if (!item) throw badRequest("invalid intakeId");
    if (item.userId !== actor.userId && item.workspaceId !== input.workspaceId) {
      throw badRequest("not allowed");
    }
    return { duplicates: await findDuplicateTasks(input.workspaceId, item.title) };
  },

  async resolve(actor, input) {
    if (input.action === "dismiss") {
      return prisma.$transaction(async (tx) => {
        const item = await readAccessibleItem(tx, input.intakeId, actor.userId);
        const dismissed = await tx.intakeItem.updateMany({
          where: { id: input.intakeId, status: "PENDING" },
          data: { status: "DISMISSED" },
        });
        if (!dismissed.count) throw conflict("intake item already converted or dismissed");
        await tx.auditLog.create({
          data: {
            actorId: actor.userId,
            action: "INTAKE_DISMISS",
            targetWorkspaceId: item.workspaceId,
            metadata: { intakeId: item.id },
          },
        });
        return { status: "DISMISSED" as const };
      });
    }

    const workspaceId = input.workspaceId;
    if (!workspaceId) throw badRequest("workspaceId is required");

    if (input.action === "merge") {
      const targetTaskId = input.targetTaskId;
      if (!targetTaskId) throw badRequest("targetTaskId is required");
      return prisma.$transaction(async (tx) => {
        await requireMembership(tx, actor.userId, workspaceId);
        const item = await readAccessibleItem(tx, input.intakeId, actor.userId);
        const guard = await tx.intakeItem.updateMany({
          where: { id: input.intakeId, status: "PENDING" },
          data: { status: "CONVERTED", workspaceId, taskId: targetTaskId },
        });
        if (!guard.count) throw conflict("intake item already converted or dismissed");
        const appendix = `\n\n---\nInbox取り込み:\n${item.body}`;
        const updated = await tx.$executeRaw(
          Prisma.sql`UPDATE "Task"
            SET "description" = COALESCE("description", '') || ${appendix},
                "updatedAt" = NOW()
            WHERE "id" = ${targetTaskId} AND "workspaceId" = ${workspaceId}`,
        );
        if (!updated) throw badRequest("invalid targetTaskId");
        await tx.auditLog.create({
          data: {
            actorId: actor.userId,
            action: "INTAKE_MERGE",
            targetWorkspaceId: workspaceId,
            metadata: { intakeId: item.id, taskId: targetTaskId },
          },
        });
        return { taskId: targetTaskId };
      });
    }

    throw badRequest("invalid action");
  },

  captureDiscord(input) {
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.findFirst({
        where: { id: input.userId, disabledAt: null },
        select: { id: true },
      });
      if (!user) throw badRequest("configured integration user is invalid or disabled");
      const metadata = [
        input.author && `by: ${input.author}`,
        input.channel && `ch: #${input.channel}`,
      ]
        .filter(Boolean)
        .join(" | ");
      const item = await tx.intakeItem.create({
        data: {
          origin: "DISCORD",
          status: "PENDING",
          title: input.title.slice(0, 140),
          body: metadata ? `${input.body}\n\n---\n${metadata}` : input.body,
          payload: input.payload as Prisma.InputJsonValue,
          userId: input.userId,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: input.userId,
          action: "INTEGRATION_DISCORD_INTAKE_CREATE",
          metadata: {
            itemId: item.id,
            title: item.title,
            author: input.author,
            channel: input.channel,
          },
        },
      });
      return { itemId: item.id };
    });
  },
};
