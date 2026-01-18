import { requireAuth } from "../../../../lib/api-auth";
import { handleAuthError, ok } from "../../../../lib/api-response";
import { AiApplySchema } from "../../../../lib/contracts/ai";
import { createDomainErrors, errorResponse } from "../../../../lib/http/errors";
import { parseBody } from "../../../../lib/http/validation";
import { logAudit } from "../../../../lib/audit";
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
    const body = await parseBody(request, AiApplySchema, { code: "AI_VALIDATION" });
    const taskId = body.taskId;
    const type = body.type;
    const suggestionId = body.suggestionId ? String(body.suggestionId) : null;
    const payload = body.payload ?? {};

    const task = await prisma.task.findFirst({
      where: { id: taskId, workspaceId },
    });
    if (!task) {
      return errors.badRequest("invalid taskId");
    }

    if (type === "TIP") {
      const text = String(payload.text ?? "").trim();
      if (!text) {
        return errors.badRequest("payload.text is required");
      }
      const alreadyApplied = task.description?.includes(text);
      if (!alreadyApplied) {
        const appendix = `\n\n---\nAI提案:\n${text}`;
        await prisma.task.update({
          where: { id: taskId },
          data: { description: `${task.description ?? ""}${appendix}` },
        });
      }
    } else if (type === "SCORE") {
      const points = Number(payload.points ?? 0);
      const urgency = String(payload.urgency ?? "");
      const risk = String(payload.risk ?? "");
      if (!points || !urgency || !risk) {
        return errors.badRequest("payload.points/urgency/risk are required");
      }
      await prisma.task.update({
        where: { id: taskId },
        data: { points, urgency, risk },
      });
    } else if (type === "SPLIT") {
      // split itself is applied elsewhere; keep this endpoint for audit logging
    } else {
      return errors.badRequest("invalid type");
    }

    await logAudit({
      actorId: userId,
      action: "AI_APPLY",
      targetWorkspaceId: workspaceId,
      metadata: {
        taskId,
        type,
        suggestionId,
        source: "ai-apply",
      },
    });

    return ok({ ok: true });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    console.error("POST /api/ai/apply error", error);
    return errorResponse(error, {
      code: "AI_INTERNAL",
      message: "failed to apply suggestion",
      status: 500,
    });
  }
}
