import { requireWorkspaceAuth } from "../../../../lib/api-guards";
import { withApiHandler } from "../../../../lib/api-handler";
import { ok } from "../../../../lib/api-response";
import { AiReactionSchema } from "../../../../lib/contracts/ai";
import { parseBody } from "../../../../lib/http/validation";
import { recordAiReaction } from "../../../../modules/ai/index.server";

export async function POST(request: Request) {
  return withApiHandler(
    {
      logLabel: "POST /api/ai/reaction",
      errorFallback: {
        code: "AI_INTERNAL",
        message: "failed to record reaction",
        status: 500,
      },
    },
    async () => {
      const { userId, workspaceId } = await requireWorkspaceAuth({
        domain: "AI",
        requireWorkspace: true,
      });
      const body = await parseBody(request, AiReactionSchema, { code: "AI_VALIDATION" });
      const { suggestionId, reaction, context, modification, viewedAt, reactedAt } = body;

      await recordAiReaction({
        userId,
        workspaceId,
        suggestionId,
        reaction,
        context,
        modification,
        viewedAt,
        reactedAt,
      });
      return ok({ recorded: true });
    },
  );
}
