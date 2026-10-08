import { requireWorkspaceAuth } from "../../../../lib/api-guards";
import { withApiHandler } from "../../../../lib/api-handler";
import { ok } from "../../../../lib/api-response";
import { AiSuggestSchema } from "../../../../lib/contracts/ai";
import { AppError, HTTP_STATUS } from "../../../../lib/http/errors";
import { parseBody } from "../../../../lib/http/validation";
import { generateAiSuggestion, getLatestAiSuggestion } from "../../../../modules/ai/index.server";

const options = (method: string, message: string) => ({
  logLabel: `${method} /api/ai/suggest`,
  errorFallback: { code: "AI_INTERNAL", message, status: 500 },
});

export async function GET(request: Request) {
  return withApiHandler(options("GET", "failed to load suggestion"), async () => {
    const { workspaceId } = await requireWorkspaceAuth();
    if (!workspaceId) return ok({ suggestion: null, suggestionId: null });
    const taskId = new URL(request.url).searchParams.get("taskId");
    if (!taskId) {
      throw new AppError("AI_BAD_REQUEST", "taskId is required", HTTP_STATUS.BAD_REQUEST);
    }
    return ok(await getLatestAiSuggestion(workspaceId, taskId));
  });
}

export async function POST(request: Request) {
  return withApiHandler(options("POST", "failed to generate suggestion"), async () => {
    const { userId, workspaceId } = await requireWorkspaceAuth({
      domain: "AI",
      requireWorkspace: true,
    });
    const input = await parseBody(request, AiSuggestSchema, { code: "AI_VALIDATION" });
    return ok(await generateAiSuggestion({ userId, workspaceId }, input));
  });
}
