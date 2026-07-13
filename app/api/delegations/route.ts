import { requireWorkspaceAuth } from "../../../lib/api-guards";
import { withApiHandler } from "../../../lib/api-handler";
import { ok } from "../../../lib/api-response";
import { DelegationCreateSchema } from "../../../lib/contracts/delegation";
import { parseBody } from "../../../lib/http/validation";
import { createDelegatedWork, listDelegatedWork } from "../../../modules/delegation/index.server";

const options = (method: string, message: string) => ({
  logLabel: `${method} /api/delegations`,
  errorFallback: { code: "DELEGATION_INTERNAL", message, status: 500 },
});

export async function GET() {
  return withApiHandler(options("GET", "failed to load delegated work"), async () => {
    const actor = await requireWorkspaceAuth({ requireWorkspace: false });
    return ok({ jobs: await listDelegatedWork(actor) });
  });
}

export async function POST(request: Request) {
  return withApiHandler(options("POST", "failed to delegate work"), async () => {
    const actor = await requireWorkspaceAuth({ requireWorkspace: false });
    const input = await parseBody(request, DelegationCreateSchema, {
      code: "DELEGATION_VALIDATION",
    });
    return ok(
      { job: await createDelegatedWork(actor, input.request, input.mode) },
      { status: 201 },
    );
  });
}
