import { requireWorkspaceAuth } from "../../../../../../lib/api-guards";
import { withApiHandler } from "../../../../../../lib/api-handler";
import { ok } from "../../../../../../lib/api-response";
import { logAudit } from "../../../../../../lib/audit";
import { CommentUpdateSchema } from "../../../../../../lib/contracts/comment";
import { createDomainErrors } from "../../../../../../lib/http/errors";
import { parseBody } from "../../../../../../lib/http/validation";
import prisma from "../../../../../../lib/prisma";

const errors = createDomainErrors("COMMENT");

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; commentId: string }> },
) {
  return withApiHandler(
    {
      logLabel: "PATCH /api/tasks/[id]/comments/[commentId]",
      errorFallback: {
        code: "COMMENT_INTERNAL",
        message: "failed to update comment",
        status: 500,
      },
    },
    async () => {
      const { id: taskId, commentId } = await params;
      const { userId, workspaceId } = await requireWorkspaceAuth({
        domain: "COMMENT",
        requireWorkspace: true,
      });

      const body = await parseBody(request, CommentUpdateSchema, {
        code: "COMMENT_VALIDATION",
      });

      const comment = await prisma.taskComment.findFirst({
        where: { id: commentId, taskId, workspaceId },
        select: { id: true, authorId: true },
      });
      if (!comment) {
        return errors.notFound("comment not found");
      }
      if (comment.authorId !== userId) {
        return errors.forbidden("not the author");
      }

      const updated = await prisma.taskComment.update({
        where: { id: commentId },
        data: {
          content: body.content.trim(),
          editedAt: new Date(),
        },
        include: {
          author: {
            select: { id: true, name: true, email: true, image: true },
          },
        },
      });
      await logAudit({
        actorId: userId,
        action: "TASK_COMMENT_UPDATE",
        targetWorkspaceId: workspaceId,
        metadata: { commentId, taskId },
      });
      return ok({ comment: updated });
    },
  );
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; commentId: string }> },
) {
  return withApiHandler(
    {
      logLabel: "DELETE /api/tasks/[id]/comments/[commentId]",
      errorFallback: {
        code: "COMMENT_INTERNAL",
        message: "failed to delete comment",
        status: 500,
      },
    },
    async () => {
      const { id: taskId, commentId } = await params;
      const { userId, workspaceId } = await requireWorkspaceAuth({
        domain: "COMMENT",
        requireWorkspace: true,
      });

      const comment = await prisma.taskComment.findFirst({
        where: { id: commentId, taskId, workspaceId },
        select: { id: true, authorId: true },
      });
      if (!comment) {
        return errors.notFound("comment not found");
      }
      if (comment.authorId !== userId) {
        return errors.forbidden("not the author");
      }

      await prisma.taskComment.delete({ where: { id: commentId } });
      await logAudit({
        actorId: userId,
        action: "TASK_COMMENT_DELETE",
        targetWorkspaceId: workspaceId,
        metadata: { commentId, taskId },
      });
      return ok({ ok: true });
    },
  );
}
