import { normalizeSeverity, normalizeStoryPoint } from "../../../lib/ai-normalization";
import { AiSplitApplyPayloadSchema } from "../../../lib/contracts/ai";
import { AUTOMATION_STATUS } from "../../../lib/types";
import { ApplicationError } from "../../shared/application/application-error";
import { runSerializableTransaction } from "../../shared/infrastructure/prisma-serializable-transaction";
import type { ApplyAiTaskCommand } from "../application/apply-ai-task-command";
import type { TaskActor } from "../application/task-types";
import { splitTaskIntoChildren } from "./prisma-task-split";

const badRequest = (message: string) =>
  new ApplicationError("AI_BAD_REQUEST", message, "bad_request");

export function applyAiTaskChange(actor: TaskActor, command: ApplyAiTaskCommand) {
  return runSerializableTransaction(
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
        // SprintItem owns the estimate captured at commitment time. Updating
        // the task estimate prepares future planning and must not rewrite or
        // revalidate the current sprint snapshot.
        await tx.task.updateMany({
          where: { id: task.id, workspaceId: actor.workspaceId },
          data: {
            points: normalizedPoints,
            urgency: normalizeSeverity(payload.urgency),
            risk: normalizeSeverity(payload.risk),
            ...(task.automationStatus === "PREPARED" || task.automationStatus === "SPLIT_REJECTED"
              ? {
                  automationStatus: "NONE" as const,
                }
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
          expectedStatuses: [
            AUTOMATION_STATUS.NONE,
            AUTOMATION_STATUS.PREPARED,
            AUTOMATION_STATUS.SPLIT_PENDING,
            AUTOMATION_STATUS.SPLIT_REJECTED,
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
    {
      code: "TASK_CONCURRENT_UPDATE",
      message: "task changed concurrently; retry the operation",
    },
  );
}
