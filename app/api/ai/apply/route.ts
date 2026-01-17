import { requireAuth } from "../../../../lib/api-auth";
import {
  badRequest,
  handleAuthError,
  ok,
  serverError,
} from "../../../../lib/api-response";
import { logAudit } from "../../../../lib/audit";
import prisma from "../../../../lib/prisma";
import { resolveWorkspaceId } from "../../../../lib/workspace-context";

export async function POST(request: Request) {
  try {
    const { userId } = await requireAuth();
    const workspaceId = await resolveWorkspaceId(userId);
    if (!workspaceId) {
      return badRequest("workspace is required");
    }
    const body = await request.json();
    const taskId = String(body.taskId ?? "");
    const type = String(body.type ?? "");
    const suggestionId = body.suggestionId ? String(body.suggestionId) : null;
    const payload = body.payload ?? {};

    if (!taskId || !type) {
      return badRequest("taskId and type are required");
    }

    const task = await prisma.task.findFirst({
      where: { id: taskId, workspaceId },
    });
    if (!task) {
      return badRequest("invalid taskId");
    }

    if (type === "TIP") {
      const text = String(payload.text ?? "").trim();
      if (!text) {
        return badRequest("payload.text is required");
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
        return badRequest("payload.points/urgency/risk are required");
      }
      await prisma.task.update({
        where: { id: taskId },
        data: { points, urgency, risk },
      });
    } else if (type === "SPLIT") {
      // split itself is applied elsewhere; keep this endpoint for audit logging
    } else {
      return badRequest("invalid type");
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
    return serverError("failed to apply suggestion");
  }
}
