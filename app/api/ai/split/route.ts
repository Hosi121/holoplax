import { generateSplitSuggestions } from "../../../../lib/ai-suggestions";
import { requireWorkspaceAuth } from "../../../../lib/api-guards";
import { withApiHandler } from "../../../../lib/api-handler";
import { ok } from "../../../../lib/api-response";
import { logAudit } from "../../../../lib/audit";
import { AiSplitSchema } from "../../../../lib/contracts/ai";
import { createDomainErrors } from "../../../../lib/http/errors";
import { parseBody } from "../../../../lib/http/validation";
import prisma from "../../../../lib/prisma";

const errors = createDomainErrors("AI");

export async function POST(request: Request) {
  return withApiHandler(
    {
      logLabel: "POST /api/ai/split",
      errorFallback: {
        code: "AI_INTERNAL",
        message: "failed to split task",
        status: 500,
      },
    },
    async () => {
      const { userId, workspaceId } = await requireWorkspaceAuth({
        domain: "AI",
        requireWorkspace: true,
      });
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

      await logAudit({
        actorId: userId,
        action: "AI_SPLIT_GENERATE",
        targetWorkspaceId: workspaceId,
        metadata: { suggestionId: saved.id, taskId, splitCount: result.suggestions?.length },
      });
      return ok({ suggestions: result.suggestions, suggestionId: saved.id });
    },
  );
}
