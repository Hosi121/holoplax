import { requireWorkspaceAuth } from "../../../../lib/api-guards";
import { withApiHandler } from "../../../../lib/api-handler";
import { ok } from "../../../../lib/api-response";
import { AutomationApprovalSchema } from "../../../../lib/contracts/automation";
import { parseBody } from "../../../../lib/http/validation";
import { reviewTaskSplit } from "../../../../modules/automation/index.server";

export async function POST(request: Request) {
  return withApiHandler(
    {
      logLabel: "POST /api/automation/approval",
      errorFallback: {
        code: "AUTOMATION_INTERNAL",
        message: "failed to process approval",
        status: 500,
      },
    },
    async () => {
      const actor = await requireWorkspaceAuth({ domain: "AUTOMATION", requireWorkspace: true });
      const command = await parseBody(request, AutomationApprovalSchema, {
        code: "AUTOMATION_VALIDATION",
        allowEmpty: true,
      });
      return ok(await reviewTaskSplit(actor, command));
    },
  );
}
