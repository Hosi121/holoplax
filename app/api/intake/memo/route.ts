import { requireAuth } from "../../../../lib/api-auth";
import { withApiHandler } from "../../../../lib/api-handler";
import { ok } from "../../../../lib/api-response";
import { IntakeMemoSchema } from "../../../../lib/contracts/intake";
import { parseBody } from "../../../../lib/http/validation";
import { resolveWorkspaceId } from "../../../../lib/workspace-context";
import { createIntakeMemo } from "../../../../modules/intake/index.server";

export async function POST(request: Request) {
  return withApiHandler(
    {
      logLabel: "POST /api/intake/memo",
      errorFallback: {
        code: "INTAKE_INTERNAL",
        message: "failed to create intake item",
        status: 500,
      },
    },
    async () => {
      const { userId } = await requireAuth();
      const body = await parseBody(request, IntakeMemoSchema, { code: "INTAKE_VALIDATION" });
      const text = body.text;
      const requestedWorkspaceId = body.workspaceId ?? null;

      let workspaceId = requestedWorkspaceId;
      if (!workspaceId && body.assignToCurrentWorkspace) {
        // fallback for memo capture if caller wants current workspace
        const resolved = await resolveWorkspaceId(userId);
        if (resolved) workspaceId = resolved;
      }

      return ok(await createIntakeMemo({ userId, workspaceId }, text));
    },
  );
}
