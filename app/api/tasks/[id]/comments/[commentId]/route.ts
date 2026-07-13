import { requireWorkspaceAuth } from "../../../../../../lib/api-guards";
import { withApiHandler } from "../../../../../../lib/api-handler";
import { ok } from "../../../../../../lib/api-response";
import { CommentUpdateSchema } from "../../../../../../lib/contracts/comment";
import { parseBody } from "../../../../../../lib/http/validation";
import { deleteTaskComment, updateTaskComment } from "../../../../../../modules/tasks/index.server";

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

      const updated = await updateTaskComment(
        { userId, workspaceId },
        taskId,
        commentId,
        body.content,
      );
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

      await deleteTaskComment({ userId, workspaceId }, taskId, commentId);
      return ok({ ok: true });
    },
  );
}
