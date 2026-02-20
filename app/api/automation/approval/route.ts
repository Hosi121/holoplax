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

const parseSuggestions = (output: string | null, fallback: SplitItem[]) => {
  if (!output) {
    return fallback.map(sanitizeSplitSuggestion);
  }
  try {
    const parsed = JSON.parse(output);
    if (Array.isArray(parsed)) {
      return parsed.map(sanitizeSplitSuggestion);
    }
    if (Array.isArray(parsed?.suggestions)) {
      return parsed.suggestions.map(sanitizeSplitSuggestion);
    }
  } catch {
    // ignore
  }
  return fallback.map(sanitizeSplitSuggestion);
};

const maybeRaiseStage = async (userId: string, workspaceId: string) => {
  const setting = await prisma.userAutomationSetting.findFirst({
    where: { userId, workspaceId },
  });
  if (!setting) return null;
  const currentStage = setting.stage ?? 0;
  if (currentStage >= MAX_STAGE) return null;
  if (setting.lastStageAt) {
    const diff = Date.now() - new Date(setting.lastStageAt).getTime();
    if (diff < STAGE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000) {
      return null;
    }
  }
  const nextStage = currentStage + 1;
  await prisma.$transaction(async (tx) => {
    await tx.userAutomationSetting.update({
      where: { id: setting.id },
      data: { stage: nextStage, lastStageAt: new Date() },
    });
    await tx.automationStageHistory.create({
      data: {
        userId,
        workspaceId,
        stage: nextStage,
        reason: "split_approval",
      },
    });
  });
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
        await prisma.task.update({
          where: { id: task.id },
          data: { automationState: AUTOMATION_STATE.SPLIT_REJECTED },
        });
        return ok({ status: "rejected" });
      }

      if (task.automationState !== AUTOMATION_STATE.PENDING_SPLIT) {
        return ok({ status: "no-pending", created: 0 });
      }

      const latest = await prisma.aiSuggestion.findFirst({
        where: { taskId: task.id, workspaceId, type: "SPLIT" },
        orderBy: { createdAt: "desc" },
        select: { output: true },
      });

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
      const suggestions = parseSuggestions(latest?.output ?? null, fallbackResult.suggestions);
      await prisma.$transaction(async (tx) => {
        await tx.task.update({
          where: { id: task.id },
          data: { automationState: AUTOMATION_STATE.SPLIT_PARENT },
        });

        await tx.task.createMany({
          data: suggestions.map((item: SplitItem) => ({
            title: item.title,
            description: item.detail ?? "",
            // item.points is already a valid Fibonacci number after sanitizeSplitSuggestion
            points: item.points,
            urgency: item.urgency ?? SEVERITY.MEDIUM,
            risk: item.risk ?? SEVERITY.MEDIUM,
            status: TASK_STATUS.BACKLOG,
            automationState: AUTOMATION_STATE.SPLIT_CHILD,
            type: TASK_TYPE.TASK,
            parentId: task.id,
            workspaceId,
            userId,
          })),
        });
      });

      await maybeRaiseStage(userId, workspaceId);
      return ok({ status: "approved", created: suggestions.length });
    },
  );
}
