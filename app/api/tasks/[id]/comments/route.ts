import { requireWorkspaceAuth } from "../../../../../lib/api-guards";
import { withApiHandler } from "../../../../../lib/api-handler";
import { ok } from "../../../../../lib/api-response";
import { CommentCreateSchema } from "../../../../../lib/contracts/comment";
import { createDomainErrors } from "../../../../../lib/http/errors";
import { parseBody } from "../../../../../lib/http/validation";
import prisma from "../../../../../lib/prisma";

const errors = createDomainErrors("COMMENT");

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
        return errors.unauthorized("workspace not selected");
      }

      const task = await prisma.task.findFirst({
        where: { id: taskId, workspaceId },
        select: { id: true },
      });
      if (!task) {
        return errors.notFound("task not found");
      }

      const comments = await prisma.taskComment.findMany({
        where: { taskId, workspaceId },
        orderBy: { createdAt: "asc" },
        include: {
          author: {
            select: { id: true, name: true, email: true, image: true },
          },
        },
      });

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
      if (!workspaceId) {
        return errors.unauthorized("workspace not selected");
      }

      const body = await parseBody(request, CommentCreateSchema, {
        code: "COMMENT_VALIDATION",
      });

      const task = await prisma.task.findFirst({
        where: { id: taskId, workspaceId },
        select: { id: true },
      });
      if (!task) {
        return errors.notFound("task not found");
      }

      const comment = await prisma.taskComment.create({
        data: {
          taskId,
          authorId: userId,
          workspaceId,
          content: body.content.trim(),
        },
        include: {
          author: {
            select: { id: true, name: true, email: true, image: true },
          },
        },
      });

      return ok({ comment });
    },
  );
}
