import { withApiHandler } from "../../../../lib/api-handler";
import { requireWorkspaceAuth } from "../../../../lib/api-guards";
import { ok } from "../../../../lib/api-response";
import { generateSplitSuggestions } from "../../../../lib/ai-suggestions";
import {
  PENDING_APPROVAL_TAG,
  SPLIT_REJECTED_TAG,
  SPLIT_CHILD_TAG,
  SPLIT_PARENT_TAG,
  withTag,
  withoutTags,
} from "../../../../lib/automation-constants";
import { AutomationApprovalSchema } from "../../../../lib/contracts/automation";
import { createDomainErrors } from "../../../../lib/http/errors";
import { parseBody } from "../../../../lib/http/validation";
import prisma from "../../../../lib/prisma";
import { TASK_STATUS, TASK_TYPE } from "../../../../lib/types";
import { logAudit } from "../../../../lib/audit";

const STAGE_COOLDOWN_DAYS = 7;
const MAX_STAGE = 3;
const errors = createDomainErrors("AUTOMATION");

type SplitSuggestion = {
  title: string;
  points: number;
  urgency?: string;
  risk?: string;
  detail?: string;
};

const parseSuggestions = (output: string | null, fallback: SplitSuggestion[]) => {
  if (!output) return fallback;
  try {
    const parsed = JSON.parse(output);
    if (Array.isArray(parsed)) return parsed as SplitSuggestion[];
    if (Array.isArray(parsed?.suggestions)) return parsed.suggestions as SplitSuggestion[];
  } catch {
    // ignore
  }
  return fallback;
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
          tags: true,
        },
      });
      if (!task) return errors.notFound("task not found");

      if (action === "reject") {
        const nextTags = withTag(
          withoutTags(task.tags ?? [], [PENDING_APPROVAL_TAG, SPLIT_PARENT_TAG]),
          SPLIT_REJECTED_TAG,
        );
        await prisma.task.update({
          where: { id: task.id },
          data: { tags: nextTags },
        });
        return ok({ status: "rejected" });
      }

      if (!task.tags?.includes(PENDING_APPROVAL_TAG)) {
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
      const suggestions = parseSuggestions(
        latest?.output ?? null,
        fallbackResult.suggestions,
      );
      await prisma.$transaction(async (tx) => {
        const nextTags = withTag(
          withoutTags(task.tags ?? [], [PENDING_APPROVAL_TAG, SPLIT_REJECTED_TAG]),
          SPLIT_PARENT_TAG,
        );
        await tx.task.update({
          where: { id: task.id },
          data: { tags: nextTags },
        });

        await Promise.all(
          suggestions.map((item) =>
            tx.task.create({
              data: {
                title: item.title,
                description: item.detail ?? "",
                points: Number(item.points) || 1,
                urgency: item.urgency ?? "中",
                risk: item.risk ?? "中",
                status: TASK_STATUS.BACKLOG,
                tags: withTag([], SPLIT_CHILD_TAG),
                type: TASK_TYPE.TASK,
                parentId: task.id,
                workspaceId,
                userId,
              },
            }),
          ),
        );
      });

      await maybeRaiseStage(userId, workspaceId);
      return ok({ status: "approved", created: suggestions.length });
    },
  );
}
