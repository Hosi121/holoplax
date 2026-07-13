import { requireWorkspaceAuth } from "../../../../lib/api-guards";
import { withApiHandler } from "../../../../lib/api-handler";
import { ok } from "../../../../lib/api-response";
import { SprintUpdateSchema } from "../../../../lib/contracts/sprint";
import { parseBody } from "../../../../lib/http/validation";
import { updateSprint } from "../../../../modules/sprints/index.server";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withApiHandler(
    {
      logLabel: "PATCH /api/sprints/[id]",
      errorFallback: {
        code: "SPRINT_INTERNAL",
        message: "failed to update sprint",
        status: 500,
      },
    },
    async () => {
      const { userId, workspaceId } = await requireWorkspaceAuth({
        domain: "SPRINT",
        requireWorkspace: true,
      });
      const { id: sprintId } = await params;
      const input = await parseBody(request, SprintUpdateSchema, {
        code: "SPRINT_VALIDATION",
      });
      return ok({
        sprint: await updateSprint({ userId, workspaceId }, sprintId, input),
      });
    },
  );
}
