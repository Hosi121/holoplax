import { requireWorkspaceAuth } from "../../../lib/api-guards";
import { withApiHandler } from "../../../lib/api-handler";
import { ok } from "../../../lib/api-response";
import { getReviewSnapshot } from "../../../modules/review/index.server";

export async function GET() {
  return withApiHandler(
    {
      logLabel: "GET /api/review",
      errorFallback: { code: "REVIEW_INTERNAL", message: "failed to load review" },
    },
    async () => {
      const { userId, workspaceId } = await requireWorkspaceAuth({ requireWorkspace: true });
      return ok(
        await getReviewSnapshot(userId, workspaceId, new Date(Date.now() - 24 * 60 * 60 * 1000)),
      );
    },
  );
}
