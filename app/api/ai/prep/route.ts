import { generateAndSaveAiPrep, isValidPrepType } from "../../../../lib/ai-prep";
import { requireWorkspaceAuth } from "../../../../lib/api-guards";
import { withApiHandler } from "../../../../lib/api-handler";
import { ok } from "../../../../lib/api-response";
import { logAudit } from "../../../../lib/audit";
import { AiPrepSchema } from "../../../../lib/contracts/ai";
import { createDomainErrors } from "../../../../lib/http/errors";
import { parseBody } from "../../../../lib/http/validation";
import prisma from "../../../../lib/prisma";

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
      const outputs = await prisma.aiPrepOutput.findMany({
        where: { taskId, workspaceId },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          type: true,
          status: true,
          output: true,
          createdAt: true,
        },
      });
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
      if (!isValidPrepType(type)) {
        return errors.badRequest("invalid type");
      }

      const task = await prisma.task.findFirst({
        where: { id: taskId, workspaceId },
        select: { id: true, title: true, description: true },
      });
      if (!task) {
        return errors.badRequest("invalid taskId");
      }

      const saved = await generateAndSaveAiPrep({
        task,
        type,
        userId,
        workspaceId,
      });
      await logAudit({
        actorId: userId,
        action: "AI_PREP_GENERATE",
        targetWorkspaceId: workspaceId,
        metadata: { taskId, type },
      });
      return ok({ output: saved });
    },
  );
}
