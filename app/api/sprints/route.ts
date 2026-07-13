import { requireWorkspaceAuth } from "../../../lib/api-guards";
import { withApiHandler } from "../../../lib/api-handler";
import { ok } from "../../../lib/api-response";
import { listSprints, type SprintStatus } from "../../../modules/sprints/index.server";

const isSprintStatus = (value: string | null): value is SprintStatus =>
  value === "ACTIVE" || value === "CLOSED";

export async function GET(request: Request) {
  return withApiHandler(
    {
      logLabel: "GET /api/sprints",
      errorFallback: {
        code: "SPRINT_INTERNAL",
        message: "failed to load sprints",
        status: 500,
      },
    },
    async () => {
      const { workspaceId } = await requireWorkspaceAuth();
      if (!workspaceId) return ok({ sprints: [] });
      const { searchParams } = new URL(request.url);
      const statusParam = searchParams.get("status");
      const limitParam = searchParams.get("limit");
      const parsedLimit = limitParam !== null ? Number.parseInt(limitParam, 10) : 20;
      const limit = Number.isNaN(parsedLimit) || parsedLimit <= 0 ? undefined : parsedLimit;
      const sprints = await listSprints(workspaceId, {
        status: isSprintStatus(statusParam) ? statusParam : undefined,
        limit,
      });
      return ok({ sprints });
    },
  );
}
