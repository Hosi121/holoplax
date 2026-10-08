import { requireWorkspaceAuth } from "../../../lib/api-guards";
import { withApiHandler } from "../../../lib/api-handler";
import { ok } from "../../../lib/api-response";
import { MemoryClaimCreateSchema, MemoryClaimDeleteSchema } from "../../../lib/contracts/memory";
import { parseBody } from "../../../lib/http/validation";
import {
  createMemoryClaim,
  deleteMemoryClaim,
  listMemory,
} from "../../../modules/memory/index.server";

export async function GET() {
  return withApiHandler(
    {
      logLabel: "GET /api/memory",
      errorFallback: {
        code: "MEMORY_INTERNAL",
        message: "failed to load memory",
        status: 500,
      },
    },
    async () => {
      const { userId, workspaceId } = await requireWorkspaceAuth();
      return ok(await listMemory({ userId, workspaceId }));
    },
  );
}

export async function POST(request: Request) {
  return withApiHandler(
    {
      logLabel: "POST /api/memory",
      errorFallback: {
        code: "MEMORY_INTERNAL",
        message: "failed to save memory",
        status: 500,
      },
    },
    async () => {
      const { userId, workspaceId } = await requireWorkspaceAuth();
      const body = await parseBody(request, MemoryClaimCreateSchema, {
        code: "MEMORY_VALIDATION",
      });
      const claim = await createMemoryClaim({ userId, workspaceId }, body.definitionId, body.value);
      return ok({ claim });
    },
  );
}

export async function DELETE(request: Request) {
  return withApiHandler(
    {
      logLabel: "DELETE /api/memory",
      errorFallback: {
        code: "MEMORY_INTERNAL",
        message: "failed to delete memory claim",
        status: 500,
      },
    },
    async () => {
      const { userId, workspaceId } = await requireWorkspaceAuth();
      const body = await parseBody(request, MemoryClaimDeleteSchema, {
        code: "MEMORY_VALIDATION",
      });
      const updated = await deleteMemoryClaim({ userId, workspaceId }, body.claimId);
      return ok({ claim: updated });
    },
  );
}
