import { requireAuth } from "../../../../lib/api-auth";
import {
  badRequest,
  handleAuthError,
  ok,
  serverError,
} from "../../../../lib/api-response";
import { generateSplitSuggestions } from "../../../../lib/ai-suggestions";
import { buildAiUsageMetadata } from "../../../../lib/ai-usage";
import prisma from "../../../../lib/prisma";
import { resolveWorkspaceId } from "../../../../lib/workspace-context";
import { logAudit } from "../../../../lib/audit";

export async function POST(request: Request) {
  try {
    const { userId } = await requireAuth();
    const workspaceId = await resolveWorkspaceId(userId);
    if (!workspaceId) {
      return badRequest("workspace is required");
    }
    const body = await request.json();
    const title = String(body.title ?? "").trim();
    const description = String(body.description ?? "").trim();
    const points = Number(body.points ?? 0);
    const taskId = body.taskId ?? null;
    if (!title || !Number.isFinite(points) || points <= 0) {
      return badRequest("title and points are required");
    }
    if (taskId) {
      const task = await prisma.task.findFirst({
        where: { id: taskId, workspaceId },
        select: { id: true },
      });
      if (!task) {
        return badRequest("invalid taskId");
      }
    }

    const result = await generateSplitSuggestions({
      title,
      description,
      points,
    });
    const usageMeta = buildAiUsageMetadata(result.provider, result.model, result.usage);
    if (usageMeta) {
      await logAudit({
        actorId: userId,
        action: "AI_SPLIT",
        targetWorkspaceId: workspaceId,
        metadata: {
          ...usageMeta,
          taskId,
          source: "ai-split",
        },
      });
    }

    await prisma.aiSuggestion.create({
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

    return ok({ suggestions: result.suggestions });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    console.error("POST /api/ai/split error", error);
    return serverError("failed to split task");
  }
}
