import { requireWorkspaceAuth } from "../../../../lib/api-guards";
import { withApiHandler } from "../../../../lib/api-handler";
import { ok } from "../../../../lib/api-response";
import { AiApplySchema } from "../../../../lib/contracts/ai";
import { parseBody } from "../../../../lib/http/validation";
import { applyAiTaskChange } from "../../../../modules/tasks/index.server";

export async function POST(request: Request) {
  return withApiHandler(
    {
      logLabel: "POST /api/ai/apply",
      errorFallback: {
        code: "AI_INTERNAL",
        message: "failed to apply suggestion",
        status: 500,
      },
    },
    async () => {
      const actor = await requireWorkspaceAuth({ domain: "AI", requireWorkspace: true });
      const command = await parseBody(request, AiApplySchema, { code: "AI_VALIDATION" });
      return ok(await applyAiTaskChange(actor, command));
    },
  );
}
