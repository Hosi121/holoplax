import { requireAuth } from "../../../../lib/api-auth";
import { withApiHandler } from "../../../../lib/api-handler";
import { ok } from "../../../../lib/api-response";
import { IntakeResolveSchema } from "../../../../lib/contracts/intake";
import { parseBody } from "../../../../lib/http/validation";
import { resolveIntakeItem } from "../../../../modules/intake/index.server";

export async function POST(request: Request) {
  return withApiHandler(
    {
      logLabel: "POST /api/intake/resolve",
      errorFallback: {
        code: "INTAKE_INTERNAL",
        message: "failed to resolve intake item",
        status: 500,
      },
    },
    async () => {
      const { userId } = await requireAuth();
      const body = await parseBody(request, IntakeResolveSchema, {
        code: "INTAKE_VALIDATION",
      });
      return ok(
        await resolveIntakeItem(
          { userId },
          {
            intakeId: body.intakeId,
            action: body.action,
            workspaceId: body.workspaceId,
            taskType: body.taskType,
            targetTaskId: body.targetTaskId,
          },
        ),
      );
    },
  );
}
