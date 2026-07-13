import { requireWorkspaceAuth } from "../../../lib/api-guards";
import { withApiHandler } from "../../../lib/api-handler";
import { ok } from "../../../lib/api-response";
import { getVelocity } from "../../../modules/analytics/index.server";

export async function GET() {
  return withApiHandler(
    {
      logLabel: "GET /api/velocity",
      errorFallback: {
        code: "VELOCITY_INTERNAL",
        message: "failed to load velocity",
        status: 500,
      },
    },
    async () => {
      const { workspaceId } = await requireWorkspaceAuth();
      if (!workspaceId) {
        return ok({ velocity: [] });
      }
      return ok(await getVelocity(workspaceId));
    },
  );
}
