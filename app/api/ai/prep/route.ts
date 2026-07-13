import { requireWorkspaceAuth } from "../../../../lib/api-guards";
import { withApiHandler } from "../../../../lib/api-handler";
import { ok } from "../../../../lib/api-response";
import { AiPrepSchema } from "../../../../lib/contracts/ai";
import { createDomainErrors } from "../../../../lib/http/errors";
import { parseBody } from "../../../../lib/http/validation";
import { generateAiPrep, listAiPrep } from "../../../../modules/ai/index.server";

const errors = createDomainErrors("AI");

export async function GET(request: Request) {
  return withApiHandler(
    {
      logLabel: "GET /api/ai/prep",
      errorFallback: {
        code: "AI_INTERNAL",
        message: "failed to load ai prep outputs",
        status: 500,
      },
    },
    async () => {
      const { workspaceId } = await requireWorkspaceAuth();
      if (!workspaceId) {
        return ok({ outputs: [] });
      }
      const { searchParams } = new URL(request.url);
      const taskId = searchParams.get("taskId");
      if (!taskId) {
        return errors.badRequest("taskId is required");
      }
      const outputs = await listAiPrep(workspaceId, taskId);
      return ok({ outputs });
    },
  );
}

export async function POST(request: Request) {
  return withApiHandler(
    {
      logLabel: "POST /api/ai/prep",
      errorFallback: {
        code: "AI_INTERNAL",
        message: "failed to generate ai prep output",
        status: 500,
      },
    },
    async () => {
      const { userId, workspaceId } = await requireWorkspaceAuth({
        domain: "AI",
        requireWorkspace: true,
      });
      const body = await parseBody(request, AiPrepSchema, { code: "AI_VALIDATION" });
      const taskId = body.taskId;
      const type = body.type;
      const saved = await generateAiPrep({
        taskId,
        type,
        userId,
        workspaceId,
      });
      return ok({ output: saved });
    },
  );
}
