import { sanitizeSplitSuggestion } from "../../../../lib/ai-normalization";
import type { SplitItem } from "../../../../lib/ai-suggestions";
import { generateSplitSuggestions } from "../../../../lib/ai-suggestions";
import { requireWorkspaceAuth } from "../../../../lib/api-guards";
import { withApiHandler } from "../../../../lib/api-handler";
import { ok } from "../../../../lib/api-response";
import { logAudit } from "../../../../lib/audit";
import { AutomationApprovalSchema } from "../../../../lib/contracts/automation";
import { createDomainErrors } from "../../../../lib/http/errors";
import { parseBody } from "../../../../lib/http/validation";
import prisma from "../../../../lib/prisma";
import { AUTOMATION_STATE, SEVERITY, TASK_STATUS, TASK_TYPE } from "../../../../lib/types";

const STAGE_COOLDOWN_DAYS = 7;
const MAX_STAGE = 3;
const errors = createDomainErrors("AUTOMATION");

const parseSuggestions = (output: string | null): SplitItem[] | null => {
  if (!output) return null;
  try {
    const parsed = JSON.parse(output);
    if (Array.isArray(parsed)) {
      return parsed.length ? parsed.map(sanitizeSplitSuggestion) : null;
    }
    if (Array.isArray(parsed?.suggestions)) {
      return parsed.suggestions.length ? parsed.suggestions.map(sanitizeSplitSuggestion) : null;
    }
  } catch {
    return null;
  }
  return null;
};

const maybeRaiseStage = async (userId: string, workspaceId: string) => {
  const nextStage = await prisma.$transaction(
    async (tx) => {
      const setting = await tx.userAutomationSetting.findUnique({
        where: { userId_workspaceId: { userId, workspaceId } },
      });
      if (!setting || setting.stage >= MAX_STAGE) return null;
      const cooldownStart = new Date(Date.now() - STAGE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
      if (setting.lastStageAt && setting.lastStageAt > cooldownStart) return null;
      const stage = setting.stage + 1;
      const claimed = await tx.userAutomationSetting.updateMany({
        where: {
          id: setting.id,
          stage: setting.stage,
          OR: [{ lastStageAt: null }, { lastStageAt: { lte: cooldownStart } }],
        },
        data: { stage, lastStageAt: new Date() },
      });
      if (claimed.count !== 1) return null;
      await tx.automationStageHistory.create({
        data: { userId, workspaceId, stage, reason: "split_approval" },
      });
      return stage;
    },
    { isolationLevel: "Serializable" },
  );
  if (nextStage === null) return null;
  await logAudit({
    actorId: userId,
    action: "AUTOMATION_STAGE_RAISE",
    targetWorkspaceId: workspaceId,
    metadata: { stage: nextStage, reason: "split_approval" },
  });
  return nextStage;
};

export async function POST(request: Request) {
  return withApiHandler(
    {
      logLabel: "POST /api/automation/approval",
      errorFallback: {
        code: "AUTOMATION_INTERNAL",
        message: "failed to process approval",
        status: 500,
      },
    },
    async () => {
      const { userId, workspaceId } = await requireWorkspaceAuth({
        domain: "AUTOMATION",
        requireWorkspace: true,
      });

      const body = await parseBody(request, AutomationApprovalSchema, {
        code: "AUTOMATION_VALIDATION",
        allowEmpty: true,
      });
      const taskId = body.taskId;
      const action = body.action;

      const task = await prisma.task.findFirst({
        where: { id: taskId, workspaceId },
        select: {
          id: true,
          title: true,
          description: true,
          points: true,
          urgency: true,
          risk: true,
          automationState: true,
        },
      });
      if (!task) return errors.notFound("task not found");

      if (action === "reject") {
        const rejected = await prisma.task.updateMany({
          where: {
            id: task.id,
            workspaceId,
            automationState: AUTOMATION_STATE.PENDING_SPLIT,
          },
          data: { automationState: AUTOMATION_STATE.SPLIT_REJECTED },
        });
        return ok({ status: rejected.count === 1 ? "rejected" : "no-pending" });
      }

      if (task.automationState !== AUTOMATION_STATE.PENDING_SPLIT) {
        return ok({ status: "no-pending", created: 0 });
      }

      const latest = await prisma.aiSuggestion.findFirst({
        where: { taskId: task.id, workspaceId, type: "SPLIT" },
        orderBy: { createdAt: "desc" },
        select: { output: true },
      });

      const savedSuggestions = parseSuggestions(latest?.output ?? null);
      const created = await prisma.$transaction(
        async (tx) => {
          // Conditional claim makes approval idempotent under double-clicks and
          // concurrent clients. Only the winner may create children.
          const claimed = await tx.task.updateMany({
            where: {
              id: task.id,
              workspaceId,
              automationState: AUTOMATION_STATE.PENDING_SPLIT,
            },
            data: { automationState: AUTOMATION_STATE.SPLIT_PARENT },
          });
          if (claimed.count !== 1) return 0;

          let suggestions = savedSuggestions;
          if (!suggestions) {
            const fallbackResult = await generateSplitSuggestions({
              title: task.title,
              description: task.description ?? "",
              points: task.points,
              context: {
                action: "AI_SPLIT",
                userId,
                workspaceId,
                taskId: task.id,
                source: "approval",
              },
            });
            suggestions = fallbackResult.suggestions.map(sanitizeSplitSuggestion);
          }

          for (const item of suggestions) {
            await tx.task.create({
              data: {
                title: item.title,
                description: item.detail ?? "",
                points: item.points,
                urgency: item.urgency ?? SEVERITY.MEDIUM,
                risk: item.risk ?? SEVERITY.MEDIUM,
                status: TASK_STATUS.BACKLOG,
                automationState: AUTOMATION_STATE.SPLIT_CHILD,
                type: TASK_TYPE.TASK,
                parentId: task.id,
                workspaceId,
                userId,
                statusEvents: {
                  create: {
                    fromStatus: null,
                    toStatus: TASK_STATUS.BACKLOG,
                    actorId: userId,
                    trigger: "API",
                    workspaceId,
                  },
                },
              },
            });
          }
          return suggestions.length;
        },
        { isolationLevel: "Serializable" },
      );

      if (created === 0) return ok({ status: "no-pending", created: 0 });

      await maybeRaiseStage(userId, workspaceId);
      return ok({ status: "approved", created });
    },
  );
}
