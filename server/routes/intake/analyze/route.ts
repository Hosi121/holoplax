import { requireAuth } from "../../../../lib/api-auth";
import { withApiHandler } from "../../../../lib/api-handler";
import { ok } from "../../../../lib/api-response";
import { IntakeAnalyzeSchema } from "../../../../lib/contracts/intake";
import { parseBody } from "../../../../lib/http/validation";
import { analyzeIntakeItem } from "../../../../modules/intake/index.server";

export async function POST(request: Request) {
  return withApiHandler(
    {
      logLabel: "POST /api/intake/analyze",
      errorFallback: {
        code: "INTAKE_INTERNAL",
        message: "failed to analyze intake item",
        status: 500,
      },
    },
    async () => {
      const { userId } = await requireAuth();
      const body = await parseBody(request, IntakeAnalyzeSchema, {
        code: "INTAKE_VALIDATION",
      });
      const intakeId = body.intakeId;
      const workspaceId = body.workspaceId;

      return ok(await analyzeIntakeItem({ userId, workspaceId }, { intakeId, workspaceId }));
    },
  );
}
