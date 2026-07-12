import { generateAiSplit } from "../../../../lib/ai/ai-service";
import { requireWorkspaceAuth } from "../../../../lib/api-guards";
import { withApiHandler } from "../../../../lib/api-handler";
import { ok } from "../../../../lib/api-response";
import { AiSplitSchema } from "../../../../lib/contracts/ai";
import { parseBody } from "../../../../lib/http/validation";

export async function POST(request: Request) {
  return withApiHandler(
    {
      logLabel: "POST /api/ai/split",
      errorFallback: {
        code: "AI_INTERNAL",
        message: "failed to split task",
        status: 500,
      },
    },
    async () => {
      const { userId, workspaceId } = await requireWorkspaceAuth({
        domain: "AI",
        requireWorkspace: true,
      });
      const input = await parseBody(request, AiSplitSchema, { code: "AI_VALIDATION" });
      return ok(await generateAiSplit({ userId, workspaceId, input }));
    },
  );
}
