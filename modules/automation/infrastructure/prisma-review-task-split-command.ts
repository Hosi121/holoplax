import { sanitizeSplitSuggestion } from "../../../lib/ai-normalization";
import type { SplitItem } from "../../../lib/ai-suggestions";
import { generateSplitSuggestions } from "../../../lib/ai-suggestions";
import prisma from "../../../lib/prisma";
import { AUTOMATION_STATUS } from "../../../lib/types";
import { ApplicationError } from "../../shared/application/application-error";
import { runSerializableTransaction } from "../../shared/infrastructure/prisma-serializable-transaction";
import { applyPendingTaskSplit, rejectPendingTaskSplit } from "../../tasks/index.server";
import type { ReviewTaskSplitCommandPort } from "../application/review-task-split-command";

const STAGE_COOLDOWN_DAYS = 7;
const MAX_STAGE = 3;

const notFound = (message: string) =>
  new ApplicationError("AUTOMATION_NOT_FOUND", message, "not_found");

const parseSuggestions = (output: string | null): SplitItem[] | null => {
  if (!output) return null;
  try {
    const parsed = JSON.parse(output);
    const suggestions = Array.isArray(parsed) ? parsed : parsed?.suggestions;
    return Array.isArray(suggestions) && suggestions.length
      ? suggestions.map(sanitizeSplitSuggestion)
      : null;
  } catch {
    return null;
  }
};

const maybeRaiseStage = async (userId: string, workspaceId: string) =>
  runSerializableTransaction(
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
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: "AUTOMATION_STAGE_RAISE",
          targetWorkspaceId: workspaceId,
          metadata: { stage, reason: "split_approval" },
        },
      });
      return stage;
    },
    {
      code: "AUTOMATION_CONCURRENT_UPDATE",
      message: "automation settings changed concurrently; retry the operation",
    },
  );

export const prismaReviewTaskSplitCommandPort: ReviewTaskSplitCommandPort = {
  async execute(actor, command) {
    const task = await prisma.task.findFirst({
      where: { id: command.taskId, workspaceId: actor.workspaceId },
      select: {
        id: true,
        title: true,
        description: true,
        points: true,
        automationStatus: true,
      },
    });
    if (!task) throw notFound("task not found");

    if (command.action === "reject") {
      const rejected = await rejectPendingTaskSplit(actor, task.id);
      return { status: rejected ? "rejected" : "no-pending" };
    }

    if (task.automationStatus !== AUTOMATION_STATUS.SPLIT_PENDING) {
      return { status: "no-pending", created: 0 };
    }
    const latest = await prisma.aiSuggestion.findFirst({
      where: { taskId: task.id, workspaceId: actor.workspaceId, type: "SPLIT" },
      orderBy: { createdAt: "desc" },
      select: { output: true },
    });
    let suggestions = parseSuggestions(latest?.output ?? null);
    if (!suggestions) {
      const fallback = await generateSplitSuggestions({
        title: task.title,
        description: task.description,
        points: task.points,
        context: {
          action: "AI_SPLIT",
          userId: actor.userId,
          workspaceId: actor.workspaceId,
          taskId: task.id,
          source: "approval",
        },
      });
      suggestions = fallback.suggestions.map(sanitizeSplitSuggestion);
    }

    const split = await applyPendingTaskSplit(actor, {
      taskId: task.id,
      suggestions,
    });
    if (!split.applied) return { status: "no-pending", created: 0 };
    await prisma.auditLog.create({
      data: {
        actorId: actor.userId,
        action: "AUTOMATION_SPLIT_APPROVE",
        targetWorkspaceId: actor.workspaceId,
        metadata: { taskId: task.id, created: split.created },
      },
    });
    await maybeRaiseStage(actor.userId, actor.workspaceId);
    return { status: "approved", created: split.created };
  },
};
