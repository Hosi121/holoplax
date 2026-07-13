import { requireWorkspaceAuth } from "../../../../../lib/api-guards";
import { withApiHandler } from "../../../../../lib/api-handler";
import { ok } from "../../../../../lib/api-response";
import { CommentCreateSchema } from "../../../../../lib/contracts/comment";
import { parseBody } from "../../../../../lib/http/validation";
import { createTaskComment, listTaskComments } from "../../../../../modules/tasks/index.server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withApiHandler(
    {
      logLabel: "GET /api/tasks/[id]/comments",
      errorFallback: {
        code: "COMMENT_INTERNAL",
        message: "failed to load comments",
        status: 500,
      },
    },
    async () => {
      const { id: taskId } = await params;
      const { workspaceId } = await requireWorkspaceAuth();
      if (!workspaceId) {
        return ok({ comments: [] });
      }
      const comments = await listTaskComments(workspaceId, taskId);
      return ok({ comments });
    },
  );
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withApiHandler(
    {
      logLabel: "POST /api/tasks/[id]/comments",
      errorFallback: {
        code: "COMMENT_INTERNAL",
        message: "failed to create comment",
        status: 500,
      },
    },
    async () => {
      const { id: taskId } = await params;
      const { userId, workspaceId } = await requireWorkspaceAuth({
        domain: "COMMENT",
        requireWorkspace: true,
      });

      const body = await parseBody(request, CommentCreateSchema, {
        code: "COMMENT_VALIDATION",
      });

      const comment = await createTaskComment({ userId, workspaceId }, taskId, body.content);
      return ok({ comment });
    },
  );
}
