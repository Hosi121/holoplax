import { requireWorkspaceAuth } from "../../../../lib/api-guards";
import { withApiHandler } from "../../../../lib/api-handler";
import { ok } from "../../../../lib/api-response";
import { listAiLogs } from "../../../../modules/ai/index.server";

export async function GET() {
  return withApiHandler(
    {
      logLabel: "GET /api/ai/logs",
      errorFallback: {
        code: "AI_INTERNAL",
        message: "failed to load logs",
        status: 500,
      },
    },
    async () => {
      const { workspaceId } = await requireWorkspaceAuth();
      if (!workspaceId) {
        return ok({ logs: [] });
      }
      return ok({ logs: await listAiLogs(workspaceId) });
    },
  );
}
