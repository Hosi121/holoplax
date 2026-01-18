import { requireAuth } from "../../../../lib/api-auth";
import { handleAuthError, ok } from "../../../../lib/api-response";
import { AiSplitSchema } from "../../../../lib/contracts/ai";
import { createDomainErrors, errorResponse } from "../../../../lib/http/errors";
import { parseBody } from "../../../../lib/http/validation";
import { generateSplitSuggestions } from "../../../../lib/ai-suggestions";
import prisma from "../../../../lib/prisma";
import { resolveWorkspaceId } from "../../../../lib/workspace-context";

const errors = createDomainErrors("AI");

export async function POST(request: Request) {
  try {
    const { userId } = await requireAuth();
    const workspaceId = await resolveWorkspaceId(userId);
    if (!workspaceId) {
      return errors.badRequest("workspace is required");
    }
    const body = await parseBody(request, AiSplitSchema, { code: "AI_VALIDATION" });
    const title = body.title;
    const description = body.description ?? "";
    const points = Number(body.points);
    const taskId = body.taskId ?? null;
    if (taskId) {
      const task = await prisma.task.findFirst({
        where: { id: taskId, workspaceId },
        select: { id: true },
      });
      if (!task) {
        return errors.badRequest("invalid taskId");
      }
    }

    const result = await generateSplitSuggestions({
      title,
      description,
      points,
      context: {
        action: "AI_SPLIT",
        userId,
        workspaceId,
        taskId,
        source: "ai-split",
      },
    });
    const saved = await prisma.aiSuggestion.create({
      data: {
        type: "SPLIT",
        taskId,
        inputTitle: title,
        inputDescription: description,
        output: JSON.stringify(result.suggestions),
        userId,
        workspaceId,
      },
    });

    return ok({ suggestions: result.suggestions, suggestionId: saved.id });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    console.error("POST /api/ai/split error", error);
    return errorResponse(error, {
      code: "AI_INTERNAL",
      message: "failed to split task",
      status: 500,
    });
  }
}
