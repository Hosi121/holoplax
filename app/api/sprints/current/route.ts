import { requireWorkspaceAuth } from "../../../../lib/api-guards";
import { withApiHandler } from "../../../../lib/api-handler";
import { ok } from "../../../../lib/api-response";
import { SprintStartSchema } from "../../../../lib/contracts/sprint";
import { parseBody } from "../../../../lib/http/validation";
import {
  closeCurrentSprint,
  createSprint,
  getCurrentSprint,
} from "../../../../lib/sprints/sprint-service";

const handlerOptions = (method: string, message: string) => ({
  logLabel: `${method} /api/sprints/current`,
  errorFallback: { code: "SPRINT_INTERNAL", message, status: 500 },
});

export async function GET() {
  return withApiHandler(handlerOptions("GET", "failed to load sprint"), async () => {
    const { workspaceId } = await requireWorkspaceAuth();
    return ok({ sprint: workspaceId ? await getCurrentSprint(workspaceId) : null });
  });
}

export async function POST(request: Request) {
  return withApiHandler(handlerOptions("POST", "failed to start sprint"), async () => {
    const { userId, workspaceId } = await requireWorkspaceAuth({
      domain: "SPRINT",
      requireWorkspace: true,
    });
    const input = await parseBody(request, SprintStartSchema, {
      code: "SPRINT_VALIDATION",
      allowEmpty: true,
    });
    return ok({ sprint: await createSprint({ userId, workspaceId, input }) });
  });
}

export async function PATCH() {
  return withApiHandler(handlerOptions("PATCH", "failed to end sprint"), async () => {
    const { userId, workspaceId } = await requireWorkspaceAuth({
      domain: "SPRINT",
      requireWorkspace: true,
    });
    return ok({ sprint: await closeCurrentSprint({ userId, workspaceId }) });
  });
}
