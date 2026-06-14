import { requestAiChat } from "./ai-provider";
import { generateSplitSuggestions } from "./ai-suggestions";
import type { AiUsageContext } from "./ai-usage";
import { hasNoDelegateTag } from "./automation-constants";
import prisma from "./prisma";
import { AUTOMATION_STATE, SEVERITY, TASK_STATUS, TASK_TYPE } from "./types";

const scoreFromPoints = (points: number) => Math.min(100, Math.max(0, Math.round(points * 9)));
const STAGE_STEP = 5;

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

const llmDelegationDecision = async (
  task: {
    title: string;
    description: string;
  },
  context?: AiUsageContext,
) => {
  try {
    const result = await requestAiChat({
      system:
        "あなたはタスクのAI委任判定アシスタントです。個人の学習/暗記/練習など本人がやるべき作業は委任不可。JSONのみで返してください。",
      user: `次のタスクをAI委任キューに入れるべきか判定し、JSONで返してください: { "delegatable": boolean, "reason": string }。\nタイトル: ${task.title}\n説明: ${task.description}`,
      maxTokens: 80,
      context,
    });
    if (!result?.content) return null;
    const parsed = JSON.parse(extractJson(result.content));
    if (typeof parsed?.delegatable === "boolean") {
      return { delegatable: parsed.delegatable, reason: parsed.reason };
    }
    return null;
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
  if (hasNoDelegateTag(task.tags)) return false;
  const aiDecision = await llmDelegationDecision(task, {
    action: "AI_DELEGATE",
    userId: context?.userId ?? null,
    workspaceId: context?.workspaceId ?? null,
    taskId: task.id,
    source: "automation",
  });
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
  const low = thresholds.low + stage * STAGE_STEP;
  const high = thresholds.high + stage * STAGE_STEP;
  const score = scoreFromPoints(current.points);

  // Low score: delegate to AI
  if (score < low) {
    if (!(await shouldDelegate(current, { userId, workspaceId }))) {
      return;
    }
    // Flip state and record the suggestion atomically — otherwise a failure
    // after the task.update leaves the task DELEGATED with no suggestion, a
    // state the engine never revisits (it only acts when state === NONE).
    await prisma.$transaction(async (tx) => {
      await tx.task.update({
        where: { id: current.id },
        data: {
          automationState: AUTOMATION_STATE.DELEGATED,
        },
      });
      await tx.aiSuggestion.create({
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
    });
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

  // Medium score: log suggestion only
  if (score <= high) {
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

  // High score: auto-split (with approval if required)
  if (requireApproval) {
    // Atomic state-flip + suggestion-create (see DELEGATED branch above).
    await prisma.$transaction(async (tx) => {
      await tx.task.update({
        where: { id: current.id },
        data: {
          automationState: AUTOMATION_STATE.PENDING_SPLIT,
        },
      });
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
    await tx.task.update({
      where: { id: current.id },
      data: {
        automationState: AUTOMATION_STATE.SPLIT_PARENT,
      },
    });

    await Promise.all(
      suggestions.map((item) =>
        tx.task.create({
          data: {
            title: item.title,
            description: item.detail ?? "",
            points: Number(item.points) || 1,
            urgency: item.urgency ?? SEVERITY.MEDIUM,
            risk: item.risk ?? SEVERITY.MEDIUM,
            status: TASK_STATUS.BACKLOG,
            automationState: AUTOMATION_STATE.SPLIT_CHILD,
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
