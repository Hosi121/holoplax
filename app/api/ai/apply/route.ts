import { normalizeSeverity, normalizeStoryPoint } from "../../../../lib/ai-normalization";
import { requireWorkspaceAuth } from "../../../../lib/api-guards";
import { withApiHandler } from "../../../../lib/api-handler";
import { ok } from "../../../../lib/api-response";
import { logAudit } from "../../../../lib/audit";
import { AiApplySchema, AiSplitApplyPayloadSchema } from "../../../../lib/contracts/ai";
import { createDomainErrors } from "../../../../lib/http/errors";
import { parseBody } from "../../../../lib/http/validation";
import prisma from "../../../../lib/prisma";
import { AUTOMATION_STATE, TASK_TYPE } from "../../../../lib/types";

const errors = createDomainErrors("AI");

export async function POST(request: Request) {
  return withApiHandler(
    {
      logLabel: "POST /api/ai/apply",
      errorFallback: {
        code: "AI_INTERNAL",
        message: "failed to apply suggestion",
        status: 500,
      },
    },
    async () => {
      const { userId, workspaceId } = await requireWorkspaceAuth({
        domain: "AI",
        requireWorkspace: true,
      });
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

      // If a suggestion is referenced, ensure it belongs to the caller's
      // workspace (prevents associating a foreign suggestionId via audit).
      if (suggestionId) {
        const suggestion = await prisma.aiSuggestion.findFirst({
          where: { id: suggestionId, workspaceId },
          select: { id: true },
        });
        if (!suggestion) {
          return errors.badRequest("invalid suggestionId");
        }
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
        const urgency = payload.urgency;
        const risk = payload.risk;
        if (!points || !urgency || !risk) {
          return errors.badRequest("payload.points/urgency/risk are required");
        }
        const normalizedPoints = normalizeStoryPoint(points);
        const normalizedUrgency = normalizeSeverity(urgency);
        const normalizedRisk = normalizeSeverity(risk);
        await prisma.task.update({
          where: { id: taskId },
          data: {
            points: normalizedPoints,
            urgency: normalizedUrgency,
            risk: normalizedRisk,
          },
        });
      } else if (type === "SPLIT") {
        const result = AiSplitApplyPayloadSchema.safeParse(payload);
        if (!result.success) {
          return errors.badRequest("invalid split payload");
        }
        const { status, suggestions } = result.data;
        const applied = await prisma.$transaction(async (tx) => {
          const updated = await tx.task.updateMany({
            where: {
              id: taskId,
              workspaceId,
              automationState: { not: AUTOMATION_STATE.SPLIT_PARENT },
            },
            data: { automationState: AUTOMATION_STATE.SPLIT_PARENT },
          });
          if (updated.count === 0) return false;
          await tx.task.createMany({
            data: suggestions.map((item) => ({
              title: item.title,
              description: item.detail,
              points: item.points,
              urgency: item.urgency,
              risk: item.risk,
              status,
              automationState: AUTOMATION_STATE.SPLIT_CHILD,
              type: TASK_TYPE.TASK,
              parentId: taskId,
              workspaceId,
              userId,
            })),
          });
          return true;
        });
        if (!applied) {
          return ok({ ok: true, applied: false });
        }
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
    },
  );
}
