import { requireWorkspaceAuth } from "../../../../lib/api-guards";
import { withApiHandler } from "../../../../lib/api-handler";
import { ok } from "../../../../lib/api-response";
import { DelegationActionSchema } from "../../../../lib/contracts/delegation";
import { parseBody } from "../../../../lib/http/validation";
import { actOnDelegatedWork } from "../../../../modules/delegation/index.server";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withApiHandler(
    {
      logLabel: "PATCH /api/delegations/[id]",
      errorFallback: {
        code: "DELEGATION_INTERNAL",
        message: "failed to update delegated work",
        status: 500,
      },
    },
    async () => {
      const actor = await requireWorkspaceAuth({ requireWorkspace: false });
      const { id } = await params;
      const input = await parseBody(request, DelegationActionSchema, {
        code: "DELEGATION_VALIDATION",
      });
      return ok({ job: await actOnDelegatedWork(actor, id, input.action) });
    },
  );
}
