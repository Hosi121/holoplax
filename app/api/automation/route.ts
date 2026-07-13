import { requireWorkspaceAuth } from "../../../lib/api-guards";
import { withApiHandler } from "../../../lib/api-handler";
import { ok } from "../../../lib/api-response";
import { AutomationUpdateSchema } from "../../../lib/contracts/automation";
import { parseBody } from "../../../lib/http/validation";
import {
  getAutomationSettings,
  resetAutomationStage,
  updateAutomationSettings,
} from "../../../modules/automation/index.server";

export async function GET() {
  return withApiHandler(
    {
      logLabel: "GET /api/automation",
      errorFallback: {
        code: "AUTOMATION_INTERNAL",
        message: "failed to load automation",
        status: 500,
      },
    },
    async () => {
      const { userId, workspaceId } = await requireWorkspaceAuth();
      if (!workspaceId) {
        return ok({ low: 35, high: 70, workspaceId: null });
      }
      return ok(await getAutomationSettings({ userId, workspaceId }));
    },
  );
}

export async function POST(request: Request) {
  return withApiHandler(
    {
      logLabel: "POST /api/automation",
      errorFallback: {
        code: "AUTOMATION_INTERNAL",
        message: "failed to update automation",
        status: 500,
      },
    },
    async () => {
      const { userId, workspaceId } = await requireWorkspaceAuth({
        domain: "AUTOMATION",
        requireWorkspace: true,
      });
      const body = await parseBody(request, AutomationUpdateSchema, {
        code: "AUTOMATION_VALIDATION",
      });
      // Schema guarantees low/high are finite normalized scores (0–100).
      // stage is intentionally not accepted from the client — it is server-managed.
      const { low, high } = body;
      return ok(await updateAutomationSettings({ userId, workspaceId }, { low, high }));
    },
  );
}

export async function DELETE() {
  return withApiHandler(
    {
      logLabel: "DELETE /api/automation",
      errorFallback: {
        code: "AUTOMATION_INTERNAL",
        message: "failed to reset automation stage",
        status: 500,
      },
    },
    async () => {
      const { userId, workspaceId } = await requireWorkspaceAuth({
        domain: "AUTOMATION",
        requireWorkspace: true,
      });
      return ok(await resetAutomationStage({ userId, workspaceId }));
    },
  );
}
