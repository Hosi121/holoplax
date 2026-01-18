import prisma from "./prisma";
import { generateSplitSuggestions } from "./ai-suggestions";
import { requestAiChat } from "./ai-provider";
import { buildAiUsageMetadata } from "./ai-usage";
import { logAudit } from "./audit";
import { TASK_STATUS, TASK_TYPE } from "./types";
import {
  DELEGATE_TAG,
  NO_DELEGATE_TAG,
  PENDING_APPROVAL_TAG,
  SPLIT_CHILD_TAG,
  SPLIT_PARENT_TAG,
  SPLIT_REJECTED_TAG,
  withTag,
} from "./automation-constants";

const scoreFromPoints = (points: number) =>
  Math.min(100, Math.max(0, Math.round(points * 9)));

// 高スコアはデフォルトで承認必須にする。明示的に false を指定した場合のみ自動分解を許可。
const requireApproval = process.env.AUTOMATION_REQUIRE_APPROVAL !== "false";
const nonDelegatablePattern =
  /英単語|単語帳|単語|漢字|暗記|覚える|勉強|学習|復習|練習|自習|宿題|課題|レポート|作文|音読|発音/;

const extractJson = (text: string) => {
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) {
    return text.slice(first, last + 1);
  }
  return text;
};

const llmDelegationDecision = async (task: {
  title: string;
  description: string;
}) => {
  try {
    const result = await requestAiChat({
      system:
        "あなたはタスクのAI委任判定アシスタントです。個人の学習/暗記/練習など本人がやるべき作業は委任不可。JSONのみで返してください。",
      user: `次のタスクをAI委任キューに入れるべきか判定し、JSONで返してください: { "delegatable": boolean, "reason": string }。\nタイトル: ${task.title}\n説明: ${task.description}`,
      maxTokens: 80,
    });
    if (!result) return null;
    const usageMeta = result
      ? buildAiUsageMetadata(result.provider, result.model, result.usage)
      : null;
    if (!result.content) return { usageMeta };
    const parsed = JSON.parse(extractJson(result.content));
    if (typeof parsed?.delegatable === "boolean") {
      return { delegatable: parsed.delegatable, reason: parsed.reason, usageMeta };
    }
    return { usageMeta };
  } catch {
    return null;
  }
};

const shouldDelegate = async (
  task: {
    id: string;
    title: string;
    description: string;
    tags?: string[] | null;
  },
  context?: { userId: string; workspaceId: string },
) => {
  if (task.tags?.includes(NO_DELEGATE_TAG)) return false;
  const aiDecision = await llmDelegationDecision(task);
  if (context && aiDecision?.usageMeta) {
    await logAudit({
      actorId: context.userId,
      action: "AI_DELEGATE",
      targetWorkspaceId: context.workspaceId,
      metadata: {
        ...aiDecision.usageMeta,
        taskId: task.id,
        decision:
          typeof aiDecision.delegatable === "boolean"
            ? aiDecision.delegatable
            : null,
        source: "automation",
      },
    });
  }
  if (aiDecision && typeof aiDecision.delegatable === "boolean") {
    return aiDecision.delegatable;
  }
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
    },
  });
  if (!current || current.status !== TASK_STATUS.BACKLOG) {
    return;
  }

  const thresholds = await prisma.userAutomationSetting.upsert({
    where: { userId_workspaceId: { userId, workspaceId } },
    update: {},
    create: { low: 35, high: 70, userId, workspaceId },
  });

  const score = scoreFromPoints(current.points);

  if (score < thresholds.low) {
    if (!(await shouldDelegate(current, { userId, workspaceId }))) {
      return;
    }
    await prisma.task.update({
      where: { id: current.id },
      data: {
        tags: withTag(current.tags ?? [], DELEGATE_TAG),
      },
    });
    await prisma.aiSuggestion.create({
      data: {
        type: "TIP",
        taskId: current.id,
        inputTitle: current.title,
        inputDescription: current.description,
        output: requireApproval
          ? "低スコア: AI委任候補（承認待ち）。AI委任キューに移動しました。"
          : "低スコア: AI委任候補。AI委任キューに移動しました。",
        userId,
        workspaceId,
      },
    });
    return;
  }

  if (score > thresholds.high && current.tags?.includes(SPLIT_REJECTED_TAG)) {
    return;
  }

  const splitResult = await generateSplitSuggestions({
    title: current.title,
    description: current.description,
    points: current.points,
  });
  if (splitResult.source === "provider") {
    const usageMeta = buildAiUsageMetadata(
      splitResult.provider,
      splitResult.model,
      splitResult.usage,
    );
    if (usageMeta) {
      await logAudit({
        actorId: userId,
        action: "AI_SPLIT",
        targetWorkspaceId: workspaceId,
        metadata: {
          ...usageMeta,
          taskId: current.id,
          source: "automation",
        },
      });
    }
  }
  const suggestions = splitResult.suggestions;

  const prefix =
    score > thresholds.high ? "高スコア: 分割必須" : "中スコア: 分解提案";

  // 中スコア帯は従来通りログのみ
  if (score <= thresholds.high) {
    await prisma.aiSuggestion.create({
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
    return;
  }

  // 高スコア帯: 自動分解（承認モードなら保留タグだけ付ける）
  if (current.tags?.includes(SPLIT_PARENT_TAG) || current.tags?.includes(SPLIT_REJECTED_TAG)) {
    return; // 二重分解を防ぐ
  }

  if (requireApproval) {
    await prisma.task.update({
      where: { id: current.id },
      data: {
        tags: withTag(withTag(current.tags ?? [], SPLIT_PARENT_TAG), PENDING_APPROVAL_TAG),
      },
    });
    await prisma.aiSuggestion.create({
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
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.task.update({
      where: { id: current.id },
      data: {
        tags: withTag(current.tags ?? [], SPLIT_PARENT_TAG),
      },
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
            parentId: current.id,
            workspaceId,
            userId,
          },
        }),
      ),
    );

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
