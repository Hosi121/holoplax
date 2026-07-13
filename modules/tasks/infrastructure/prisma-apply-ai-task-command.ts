import { normalizeSeverity, normalizeStoryPoint } from "../../../lib/ai-normalization";
import { AiSplitApplyPayloadSchema } from "../../../lib/contracts/ai";
import prisma from "../../../lib/prisma";
import { AUTOMATION_STATE } from "../../../lib/types";
import { ApplicationError } from "../../shared/application/application-error";
import type { ApplyAiTaskCommandPort } from "../application/apply-ai-task-command";
import { checkSprintCapacity } from "./prisma-sprint-capacity";
import { splitTaskIntoChildren } from "./prisma-task-split";

const badRequest = (message: string) =>
  new ApplicationError("AI_BAD_REQUEST", message, "bad_request");

export const prismaApplyAiTaskCommandPort: ApplyAiTaskCommandPort = {
  execute(actor, command) {
    return prisma.$transaction(
      async (tx) => {
        const task = await tx.task.findFirst({
          where: { id: command.taskId, workspaceId: actor.workspaceId },
        });
        if (!task) throw badRequest("invalid taskId");

        if (command.suggestionId) {
          const suggestion = await tx.aiSuggestion.findFirst({
            where: { id: command.suggestionId, workspaceId: actor.workspaceId },
            select: { id: true },
          });
          if (!suggestion) throw badRequest("invalid suggestionId");
        }

        const payload = command.payload ?? {};
        if (command.type === "TIP") {
          const text = String(payload.text ?? "").trim();
          if (!text) throw badRequest("payload.text is required");
          if (!task.description.includes(text)) {
            const appendix = `\n\n---\nAI提案:\n${text}`;
            await tx.task.updateMany({
              where: { id: task.id, workspaceId: actor.workspaceId },
              data: { description: `${task.description}${appendix}` },
            });
          }
        } else if (command.type === "SCORE") {
          const points = Number(payload.points ?? 0);
          if (!points || !payload.urgency || !payload.risk) {
            throw badRequest("payload.points/urgency/risk are required");
          }
          const normalizedPoints = normalizeStoryPoint(points);
          if (task.status === "SPRINT") {
            const capacity = await checkSprintCapacity(tx, {
              workspaceId: actor.workspaceId,
              additionalPoints: normalizedPoints,
              excludeTaskIds: [task.id],
            });
            if (capacity.exceeded) throw badRequest("sprint capacity exceeded");
          }
          await tx.task.updateMany({
            where: { id: task.id, workspaceId: actor.workspaceId },
            data: {
              points: normalizedPoints,
              urgency: normalizeSeverity(payload.urgency),
              risk: normalizeSeverity(payload.risk),
              ...(task.automationState === "DELEGATED" || task.automationState === "SPLIT_REJECTED"
                ? { automationState: "NONE" as const }
                : {}),
            },
          });
        } else if (command.type === "SPLIT") {
          const splitPayload = AiSplitApplyPayloadSchema.safeParse(payload);
          if (!splitPayload.success) throw badRequest("invalid split payload");
          const split = await splitTaskIntoChildren(tx, {
            taskId: task.id,
            workspaceId: actor.workspaceId,
            userId: actor.userId,
            expectedStates: [
              AUTOMATION_STATE.NONE,
              AUTOMATION_STATE.DELEGATED,
              AUTOMATION_STATE.PENDING_SPLIT,
              AUTOMATION_STATE.SPLIT_CHILD,
              AUTOMATION_STATE.SPLIT_REJECTED,
            ],
            status: splitPayload.data.status,
            suggestions: splitPayload.data.suggestions,
          });
          if (!split.applied) return { ok: true, applied: false } as const;
        } else {
          throw badRequest("invalid type");
        }

        await tx.auditLog.create({
          data: {
            actorId: actor.userId,
            action: "AI_APPLY",
            targetWorkspaceId: actor.workspaceId,
            metadata: {
              taskId: task.id,
              type: command.type,
              suggestionId: command.suggestionId ?? null,
              source: "ai-apply",
            },
          },
        });
        return { ok: true } as const;
      },
      { isolationLevel: "Serializable" },
    );
  },
};
