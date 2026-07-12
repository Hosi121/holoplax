import { generateAiScore } from "../../../../lib/ai/ai-service";
import { requireWorkspaceAuth } from "../../../../lib/api-guards";
import { withApiHandler } from "../../../../lib/api-handler";
import { ok } from "../../../../lib/api-response";
import { AiScoreSchema } from "../../../../lib/contracts/ai";
import { parseBody } from "../../../../lib/http/validation";

export async function POST(request: Request) {
  return withApiHandler(
    {
      logLabel: "POST /api/ai/score",
      errorFallback: {
        code: "AI_INTERNAL",
        message: "failed to estimate score",
        status: 500,
      },
    },
    async () => {
      const { userId, workspaceId } = await requireWorkspaceAuth({
        domain: "AI",
        requireWorkspace: true,
      });
      const input = await parseBody(request, AiScoreSchema, { code: "AI_VALIDATION" });
      return ok(await generateAiScore({ userId, workspaceId, input }));
    },
  );
}
