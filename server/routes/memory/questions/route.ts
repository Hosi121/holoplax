import { requireWorkspaceAuth } from "../../../../lib/api-guards";
import { withApiHandler } from "../../../../lib/api-handler";
import { ok } from "../../../../lib/api-response";
import { MemoryQuestionCreateSchema } from "../../../../lib/contracts/memory";
import { parseBody } from "../../../../lib/http/validation";
import { createMemoryQuestion, listMemoryQuestions } from "../../../../modules/memory/index.server";

export async function GET() {
  return withApiHandler(
    {
      logLabel: "GET /api/memory/questions",
      errorFallback: {
        code: "MEMORY_INTERNAL",
        message: "failed to load memory questions",
        status: 500,
      },
    },
    async () => {
      const { userId, workspaceId } = await requireWorkspaceAuth();
      return ok({ questions: await listMemoryQuestions({ userId, workspaceId }) });
    },
  );
}

export async function POST(request: Request) {
  return withApiHandler(
    {
      logLabel: "POST /api/memory/questions",
      errorFallback: {
        code: "MEMORY_INTERNAL",
        message: "failed to create memory question",
        status: 500,
      },
    },
    async () => {
      const { userId, workspaceId } = await requireWorkspaceAuth();
      const body = await parseBody(request, MemoryQuestionCreateSchema, {
        code: "MEMORY_VALIDATION",
      });
      const question = await createMemoryQuestion({ userId, workspaceId }, body);
      return ok({ question });
    },
  );
}
