import { requireWorkspaceAuth } from "../../../../../lib/api-guards";
import { withApiHandler } from "../../../../../lib/api-handler";
import { ok } from "../../../../../lib/api-response";
import { MemoryQuestionActionSchema } from "../../../../../lib/contracts/memory";
import { parseBody } from "../../../../../lib/http/validation";
import { actOnMemoryQuestion } from "../../../../../modules/memory/index.server";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withApiHandler(
    {
      logLabel: "PATCH /api/memory/questions/[id]",
      errorFallback: {
        code: "MEMORY_INTERNAL",
        message: "failed to update memory question",
        status: 500,
      },
    },
    async () => {
      const { userId, workspaceId } = await requireWorkspaceAuth();
      const { id: questionId } = await params;
      const body = await parseBody(request, MemoryQuestionActionSchema, {
        code: "MEMORY_VALIDATION",
      });
      const action = body.action;
      const updated = await actOnMemoryQuestion(
        { userId, workspaceId },
        questionId,
        action as "accept" | "reject" | "hold",
      );
      return ok({ question: updated });
    },
  );
}
