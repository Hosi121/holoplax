import type { Prisma } from "@prisma/client";
import prisma from "../../../lib/prisma";
import { ApplicationError } from "../../shared/application/application-error";
import type { TaskCommentCommandPort } from "../application/task-comment-types";

const commentAuthor = {
  select: { id: true, name: true, email: true, image: true },
} as const;

const notFound = (message: string) =>
  new ApplicationError("COMMENT_NOT_FOUND", message, "not_found");
const forbidden = () => new ApplicationError("COMMENT_FORBIDDEN", "not the author", "forbidden");

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

export const prismaTaskCommentCommandPort: TaskCommentCommandPort = {
  async list(workspaceId, taskId) {
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
  },

  create(actor, taskId, content) {
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
          content,
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
  },

  update(actor, taskId, commentId, content) {
    return prisma.$transaction(async (tx) => {
      const comment = await findScopedComment(tx, actor.workspaceId, taskId, commentId);
      if (comment.authorId !== actor.userId) throw forbidden();

      const updated = await tx.taskComment.update({
        where: { id: commentId },
        data: { content, editedAt: new Date() },
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
  },

  async delete(actor, taskId, commentId) {
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
  },
};
