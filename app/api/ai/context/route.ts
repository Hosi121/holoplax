import { requireWorkspaceAuth } from "../../../../lib/api-guards";
import { withApiHandler } from "../../../../lib/api-handler";
import { ok } from "../../../../lib/api-response";
import { getAiContext } from "../../../../modules/ai/index.server";

export async function GET() {
  return withApiHandler(
    {
      logLabel: "GET /api/ai/context",
      errorFallback: {
        code: "AI_INTERNAL",
        message: "failed to get AI context",
        status: 500,
      },
    },
    async () => {
      const { userId, workspaceId } = await requireWorkspaceAuth({
        domain: "AI",
        requireWorkspace: false,
      });

      return ok(await getAiContext(userId, workspaceId));
    },
  );
}
