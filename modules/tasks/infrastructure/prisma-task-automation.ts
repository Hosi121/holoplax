import { generateSplitSuggestions } from "../../../lib/ai-suggestions";
import { hasNoDelegateTag } from "../../../lib/automation-constants";
import prisma from "../../../lib/prisma";
import { AUTOMATION_STATUS, TASK_STATUS } from "../../../lib/types";
import { generateAiPrep } from "../../ai/index.server";
import type { TaskAutomationPort } from "../application/run-task-automation";
import { projectLegacyAutomationState } from "../domain/task-automation";
import { splitTaskIntoChildren } from "./prisma-task-split";

const scoreFromPoints = (points: number) => Math.min(100, Math.max(0, Math.round(points * 9)));
const MAX_AUTOMATION_STAGE = 3;
const requireApproval = process.env.AUTOMATION_REQUIRE_APPROVAL !== "false";
const nonDelegatablePattern =
  /英単語|単語帳|単語|漢字|暗記|覚える|勉強|学習|復習|練習|自習|宿題|課題|レポート|作文|音読|発音/;

const shouldDelegate = (task: { title: string; description: string; tags?: string[] | null }) => {
  if (hasNoDelegateTag(task.tags)) return false;
  return !nonDelegatablePattern.test(`${task.title}\n${task.description}`);
};

export async function applyAutomationForTask(params: {
  userId: string;
  workspaceId: string;
  task: { id: string; title: string; description: string; points: number; status: string };
}) {
  const { userId, workspaceId, task } = params;
  const current = await prisma.task.findFirst({
    where: { id: task.id, workspaceId },
    select: {
      id: true,
      title: true,
      description: true,
      points: true,
      status: true,
      workflowState: true,
      tags: true,
      automationStatus: true,
      hierarchyRole: true,
    },
  });
  if (!current || current.status !== TASK_STATUS.BACKLOG || current.workflowState !== "READY") {
    return;
  }
  if (current.automationStatus !== AUTOMATION_STATUS.NONE) return;

  const thresholds = await prisma.userAutomationSetting.upsert({
    where: { userId_workspaceId: { userId, workspaceId } },
    update: {},
    create: { low: 35, high: 70, userId, workspaceId },
  });
  const score = scoreFromPoints(current.points);

  if (score < thresholds.low) {
    if (!shouldDelegate(current)) return;
    const claimed = await prisma.task.updateMany({
      where: { id: current.id, workspaceId, automationStatus: AUTOMATION_STATUS.NONE },
      data: {
        automationStatus: AUTOMATION_STATUS.PREPARED,
        automationState: projectLegacyAutomationState({
          automationStatus: "PREPARED",
          hierarchyRole: current.hierarchyRole,
        }),
      },
    });
    if (claimed.count !== 1) return;
    let prepOutputId: string | null = null;
    try {
      const prepOutput = await generateAiPrep({
        type: "CHECKLIST",
        taskId: current.id,
        userId,
        workspaceId,
        source: "automation:delegate",
        audit: false,
      });
      prepOutputId = prepOutput.id;
      await prisma.aiSuggestion.create({
        data: {
          type: "TIP",
          taskId: current.id,
          inputTitle: current.title,
          inputDescription: current.description,
          output: "AIが実行用チェックリストを下準備しました。タスクから確認できます。",
          userId,
          workspaceId,
        },
      });
    } catch (error) {
      await prisma.task.updateMany({
        where: {
          id: current.id,
          workspaceId,
          automationStatus: AUTOMATION_STATUS.PREPARED,
        },
        data: {
          automationStatus: AUTOMATION_STATUS.NONE,
          automationState: projectLegacyAutomationState({
            automationStatus: "NONE",
            hierarchyRole: current.hierarchyRole,
          }),
        },
      });
      if (prepOutputId) await prisma.aiPrepOutput.deleteMany({ where: { id: prepOutputId } });
      throw error;
    }
    return;
  }

  const splitResult = await generateSplitSuggestions({
    title: current.title,
    description: current.description,
    points: current.points,
    context: {
      action: "AI_SPLIT",
      userId,
      workspaceId,
      taskId: current.id,
      source: "automation",
    },
  });
  const suggestions = splitResult.suggestions;
  const prefix = score > thresholds.high ? "高スコア: 分割必須" : "中スコア: 分解提案";
  const stage = thresholds.stage ?? 0;

  if (score <= thresholds.high || (requireApproval && stage < MAX_AUTOMATION_STAGE)) {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.task.updateMany({
        where: { id: current.id, workspaceId, automationStatus: AUTOMATION_STATUS.NONE },
        data: {
          automationStatus: AUTOMATION_STATUS.SPLIT_PENDING,
          automationState: projectLegacyAutomationState({
            automationStatus: "SPLIT_PENDING",
            hierarchyRole: current.hierarchyRole,
          }),
        },
      });
      if (claimed.count !== 1) return;
      await tx.aiSuggestion.create({
        data: {
          type: "SPLIT",
          taskId: current.id,
          inputTitle: current.title,
          inputDescription: current.description,
          output: JSON.stringify({
            note: score > thresholds.high ? `${prefix}（承認待ち）` : prefix,
            suggestions,
          }),
          userId,
          workspaceId,
        },
      });
    });
    return;
  }

  await prisma.$transaction(async (tx) => {
    const split = await splitTaskIntoChildren(tx, {
      taskId: current.id,
      workspaceId,
      userId,
      expectedStatuses: [AUTOMATION_STATUS.NONE],
      status: TASK_STATUS.BACKLOG,
      suggestions,
    });
    if (!split.applied) return;
    await tx.aiSuggestion.create({
      data: {
        type: "SPLIT",
        taskId: current.id,
        inputTitle: current.title,
        inputDescription: current.description,
        output: JSON.stringify({ note: `${prefix}（自動分解実行）`, suggestions }),
        userId,
        workspaceId,
      },
    });
  });
}

export const prismaTaskAutomationPort: TaskAutomationPort = {
  run: applyAutomationForTask,
};
