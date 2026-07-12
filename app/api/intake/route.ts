import { requireWorkspaceAuth } from "../../../lib/api-guards";
import { withApiHandler } from "../../../lib/api-handler";
import { ok } from "../../../lib/api-response";
import { listIntakeItems } from "../../../lib/intake/intake-service";

export async function GET() {
  return withApiHandler(
    {
      logLabel: "GET /api/intake",
      errorFallback: {
        code: "INTAKE_INTERNAL",
        message: "failed to load intake items",
        status: 500,
      },
    },
    async () => {
      const { userId, workspaceId } = await requireWorkspaceAuth();
      return ok(await listIntakeItems({ userId, workspaceId }));
    },
  );
}
