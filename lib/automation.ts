import { generateAiPrep } from "../modules/ai/index.server";
import { splitTaskIntoChildren } from "../modules/tasks/infrastructure/prisma-task-split";
import { generateSplitSuggestions } from "./ai-suggestions";
import { hasNoDelegateTag } from "./automation-constants";
import prisma from "./prisma";
import { AUTOMATION_STATE, TASK_STATUS } from "./types";

const scoreFromPoints = (points: number) => Math.min(100, Math.max(0, Math.round(points * 9)));
const MAX_AUTOMATION_STAGE = 3;

// 高スコアはデフォルトで承認必須にする。明示的に false を指定した場合のみ自動分解を許可。
const requireApproval = process.env.AUTOMATION_REQUIRE_APPROVAL !== "false";
const nonDelegatablePattern =
  /英単語|単語帳|単語|漢字|暗記|覚える|勉強|学習|復習|練習|自習|宿題|課題|レポート|作文|音読|発音/;

const shouldDelegate = (task: {
  id: string;
  title: string;
  description: string;
  tags?: string[] | null;
}) => {
  if (hasNoDelegateTag(task.tags)) return false;
  const text = `${task.title ?? ""}\n${task.description ?? ""}`;
  return !nonDelegatablePattern.test(text);
};

export async function applyAutomationForTask(params: {
  userId: string;
  workspaceId: string;
  task: {
    id: string;
    title: string;
    description: string;
    points: number;
    status: string;
  };
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
      tags: true,
      automationState: true,
    },
  });
  if (!current || current.status !== TASK_STATUS.BACKLOG) {
    return;
  }

  // Skip if already processed
  if (current.automationState !== AUTOMATION_STATE.NONE) {
    return;
  }

  const thresholds = await prisma.userAutomationSetting.upsert({
    where: { userId_workspaceId: { userId, workspaceId } },
    update: {},
    create: { low: 35, high: 70, userId, workspaceId },
  });

  const stage = thresholds.stage ?? 0;
  const low = thresholds.low;
  const high = thresholds.high;
  const score = scoreFromPoints(current.points);

  // Low score: delegate to AI
  if (score < low) {
    if (!shouldDelegate(current)) {
      return;
    }
    const claimed = await prisma.task.updateMany({
      where: { id: current.id, workspaceId, automationState: AUTOMATION_STATE.NONE },
      data: { automationState: AUTOMATION_STATE.DELEGATED },
    });
    if (claimed.count !== 1) return;
    let prepOutputId: string | null = null;
    try {
      // Delegation means producing useful work, not merely moving a card to an
      // actionless state. A provider failure still saves a template fallback.
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
      // Do not strand the task in an actionless delegated state if persistence
      // fails after the conditional claim.
      await prisma.task.updateMany({
        where: {
          id: current.id,
          workspaceId,
          automationState: AUTOMATION_STATE.DELEGATED,
        },
        data: { automationState: AUTOMATION_STATE.NONE },
      });
      if (prepOutputId) {
        await prisma.aiPrepOutput.deleteMany({ where: { id: prepOutputId } });
      }
      throw error;
    }
    return;
  }

  // Note: We only reach here if automationState === NONE
  // (already filtered above), so no need to check for SPLIT_REJECTED

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

  const prefix = score > high ? "高スコア: 分割必須" : "中スコア: 分解提案";

  // Medium score: surface the saved split suggestion for explicit review.
  if (score <= high) {
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.task.updateMany({
        where: { id: current.id, workspaceId, automationState: AUTOMATION_STATE.NONE },
        data: { automationState: AUTOMATION_STATE.PENDING_SPLIT },
      });
      if (claimed.count !== 1) return;
      await tx.aiSuggestion.create({
        data: {
          type: "SPLIT",
          taskId: current.id,
          inputTitle: current.title,
          inputDescription: current.description,
          output: JSON.stringify({ note: prefix, suggestions }),
          userId,
          workspaceId,
        },
      });
    });
    return;
  }

  // High score: auto-split (with approval if required)
  if (requireApproval && stage < MAX_AUTOMATION_STAGE) {
    // Atomic state-flip + suggestion-create (see DELEGATED branch above).
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.task.updateMany({
        where: {
          id: current.id,
          workspaceId,
          automationState: AUTOMATION_STATE.NONE,
        },
        data: {
          automationState: AUTOMATION_STATE.PENDING_SPLIT,
        },
      });
      if (claimed.count !== 1) return;
      await tx.aiSuggestion.create({
        data: {
          type: "SPLIT",
          taskId: current.id,
          inputTitle: current.title,
          inputDescription: current.description,
          output: JSON.stringify({ note: `${prefix}（承認待ち）`, suggestions }),
          userId,
          workspaceId,
        },
      });
    });
    return;
  }

  // Auto-split without approval
  await prisma.$transaction(async (tx) => {
    const split = await splitTaskIntoChildren(tx, {
      taskId: current.id,
      workspaceId,
      userId,
      expectedStates: [AUTOMATION_STATE.NONE],
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
