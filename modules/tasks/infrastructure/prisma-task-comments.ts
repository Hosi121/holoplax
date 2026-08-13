import type { Prisma } from "@prisma/client";
import prisma from "../../../lib/prisma";
import { ApplicationError } from "../../shared/application/application-error";
import type { TaskActor } from "../application/task-types";

const commentAuthor = {
  select: { id: true, name: true, email: true, image: true },
} as const;

const notFound = (message: string) =>
  new ApplicationError("COMMENT_NOT_FOUND", message, "not_found");
const forbidden = () => new ApplicationError("COMMENT_FORBIDDEN", "not the author", "forbidden");

const normalizeContent = (content: string) => {
  const normalized = content.trim();
  if (!normalized) {
    throw new ApplicationError("COMMENT_BAD_REQUEST", "comment must not be empty", "bad_request");
  }
  return normalized;
};

const findScopedComment = async (
  tx: Prisma.TransactionClient,
  workspaceId: string,
  taskId: string,
  commentId: string,
) => {
  const comment = await tx.taskComment.findFirst({
    where: { id: commentId, taskId, workspaceId },
    select: { id: true, authorId: true },
  });
  if (!comment) throw notFound("comment not found");
  return comment;
};

export async function listTaskComments(workspaceId: string, taskId: string) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, workspaceId },
    select: { id: true },
  });
  if (!task) throw notFound("task not found");

  return prisma.taskComment.findMany({
    where: { taskId, workspaceId },
    orderBy: { createdAt: "asc" },
    take: 200,
    include: { author: commentAuthor },
  });
}

export function createTaskComment(actor: TaskActor, taskId: string, content: string) {
  const normalizedContent = normalizeContent(content);
  return prisma.$transaction(async (tx) => {
    const task = await tx.task.findFirst({
      where: { id: taskId, workspaceId: actor.workspaceId },
      select: { id: true },
    });
    if (!task) throw notFound("task not found");

    const comment = await tx.taskComment.create({
      data: {
        taskId,
        authorId: actor.userId,
        workspaceId: actor.workspaceId,
        content: normalizedContent,
      },
      include: { author: commentAuthor },
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.userId,
        action: "TASK_COMMENT_CREATE",
        targetWorkspaceId: actor.workspaceId,
        metadata: { commentId: comment.id, taskId },
      },
    });
    return comment;
  });
}

export function updateTaskComment(
  actor: TaskActor,
  taskId: string,
  commentId: string,
  content: string,
) {
  const normalizedContent = normalizeContent(content);
  return prisma.$transaction(async (tx) => {
    const comment = await findScopedComment(tx, actor.workspaceId, taskId, commentId);
    if (comment.authorId !== actor.userId) throw forbidden();

    const updated = await tx.taskComment.update({
      where: { id: commentId },
      data: { content: normalizedContent, editedAt: new Date() },
      include: { author: commentAuthor },
    });
    await tx.auditLog.create({
      data: {
        actorId: actor.userId,
        action: "TASK_COMMENT_UPDATE",
        targetWorkspaceId: actor.workspaceId,
        metadata: { commentId, taskId },
      },
    });
    return updated;
  });
}

export async function deleteTaskComment(actor: TaskActor, taskId: string, commentId: string) {
  await prisma.$transaction(async (tx) => {
    const comment = await findScopedComment(tx, actor.workspaceId, taskId, commentId);
    if (comment.authorId !== actor.userId) throw forbidden();

    await tx.taskComment.delete({ where: { id: commentId } });
    await tx.auditLog.create({
      data: {
        actorId: actor.userId,
        action: "TASK_COMMENT_DELETE",
        targetWorkspaceId: actor.workspaceId,
        metadata: { commentId, taskId },
      },
    });
  });
}
