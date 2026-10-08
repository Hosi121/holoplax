import { requireWorkspaceAuth } from "../../../../../lib/api-guards";
import { withApiHandler } from "../../../../../lib/api-handler";
import { ok } from "../../../../../lib/api-response";
import { AiPrepActionSchema } from "../../../../../lib/contracts/ai";
import { createDomainErrors } from "../../../../../lib/http/errors";
import { parseBody } from "../../../../../lib/http/validation";
import { actOnAiPrep } from "../../../../../modules/ai/index.server";

const errors = createDomainErrors("AI");

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withApiHandler(
    {
      logLabel: "PATCH /api/ai/prep/[id]",
      errorFallback: {
        code: "AI_INTERNAL",
        message: "failed to update ai prep output",
        status: 500,
      },
    },
    async () => {
      const { userId, workspaceId } = await requireWorkspaceAuth({
        domain: "AI",
        requireWorkspace: true,
      });
      const { id: prepId } = await params;
      const body = await parseBody(request, AiPrepActionSchema, {
        code: "AI_VALIDATION",
      });
      const action = body.action;
      if (!prepId) {
        return errors.badRequest("id is required");
      }

      const updated = await actOnAiPrep({ userId, workspaceId, prepId, action });

      return ok({ output: updated });
    },
  );
}
