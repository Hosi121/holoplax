import type { z } from "zod";
import { normalizeSeverity, normalizeStoryPoint } from "../ai-normalization";
import { requestAiChat } from "../ai-provider";
import { generateSplitSuggestions } from "../ai-suggestions";
import { logAudit } from "../audit";
import type { AiScoreSchema, AiSplitSchema, AiSuggestSchema } from "../contracts/ai";
import { AppError, HTTP_STATUS } from "../http/errors";
import prisma from "../prisma";
import { SEVERITY } from "../types";

export type AiScoreInput = z.infer<typeof AiScoreSchema>;
export type AiSplitInput = z.infer<typeof AiSplitSchema>;
export type AiSuggestInput = z.infer<typeof AiSuggestSchema>;

const invalidTask = () => new AppError("AI_BAD_REQUEST", "invalid taskId", HTTP_STATUS.BAD_REQUEST);

const ensureTaskExists = async (workspaceId: string, taskId?: string | null) => {
  if (!taskId) return;
  const task = await prisma.task.findFirst({
    where: { id: taskId, workspaceId },
    select: { id: true },
  });
  if (!task) throw invalidTask();
};

const fallbackEstimate = (title: string, description: string) => {
  const base = title.length + description.length;
  const points = base > 120 ? 8 : base > 60 ? 5 : base > 20 ? 3 : 1;
  const isUrgent = /今日|至急|締切|すぐ/.test(`${title}${description}`);
  const isRisky = /依存|外部|不確実|未知|調査/.test(`${title}${description}`);
  const urgency = isUrgent ? SEVERITY.HIGH : SEVERITY.MEDIUM;
  const risk = isRisky ? SEVERITY.HIGH : SEVERITY.MEDIUM;
  const score = Math.min(95, Math.max(15, Math.round(points * 9 + (isUrgent ? 10 : 0))));
  return { points, urgency, risk, score, reason: "簡易ヒューリスティックで推定" };
};

const extractJson = (text: string) => {
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  return first >= 0 && last > first ? text.slice(first, last + 1) : text;
};

const cannedSuggestions = [
  "小さく分けて今日30分以内に終わる粒度にしてください。",
  "外部依存を先に洗い出し、リスクを下げるタスクを先頭に置きましょう。",
  "完了条件を1文で定義し、レビュー手順を添えましょう。",
];

export async function generateAiScore(params: {
  userId: string;
  workspaceId: string;
  input: AiScoreInput;
}) {
  const { userId, workspaceId, input } = params;
  const description = input.description ?? "";
  const taskId = input.taskId ?? null;
  await ensureTaskExists(workspaceId, taskId);
  let payload: Record<string, unknown> = fallbackEstimate(input.title, description);

  try {
    const result = await requestAiChat({
      system: "あなたはアジャイルなタスク見積もりアシスタントです。JSONのみで返してください。",
      user: `以下を見積もり、JSONで返してください: { "points": number(1-13), "urgency": "低|中|高", "risk": "低|中|高", "score": number(0-100), "reason": string }。\nタイトル: ${input.title}\n説明: ${description}`,
      maxTokens: 120,
      context: {
        action: "AI_SCORE",
        userId,
        workspaceId,
        taskId,
        source: "ai-score",
      },
    });
    if (result?.content) {
      const parsed = JSON.parse(extractJson(result.content));
      if (parsed?.points) payload = parsed;
    }
  } catch {
    // Provider failures intentionally use the deterministic fallback.
  }

  const rawScore = Number(payload.score);
  const score = Number.isFinite(rawScore) ? Math.min(100, Math.max(0, Math.round(rawScore))) : 0;
  const normalized = {
    points: normalizeStoryPoint(payload.points),
    urgency: normalizeSeverity(payload.urgency),
    risk: normalizeSeverity(payload.risk),
    score,
    reason: (typeof payload.reason === "string" ? payload.reason : "").slice(0, 500),
  };
  const saved = await prisma.aiSuggestion.create({
    data: {
      type: "SCORE",
      taskId,
      inputTitle: input.title,
      inputDescription: description,
      output: JSON.stringify(normalized),
      userId,
      workspaceId,
    },
  });
  await logAudit({
    actorId: userId,
    action: "AI_SCORE_GENERATE",
    targetWorkspaceId: workspaceId,
    metadata: { suggestionId: saved.id, taskId },
  });
  return { ...normalized, suggestionId: saved.id };
}

export async function generateAiSplit(params: {
  userId: string;
  workspaceId: string;
  input: AiSplitInput;
}) {
  const { userId, workspaceId, input } = params;
  const description = input.description ?? "";
  const taskId = input.taskId ?? null;
  await ensureTaskExists(workspaceId, taskId);
  const result = await generateSplitSuggestions({
    title: input.title,
    description,
    points: input.points,
    context: {
      action: "AI_SPLIT",
      userId,
      workspaceId,
      taskId,
      source: "ai-split",
    },
  });
  const saved = await prisma.aiSuggestion.create({
    data: {
      type: "SPLIT",
      taskId,
      inputTitle: input.title,
      inputDescription: description,
      output: JSON.stringify(result.suggestions),
      userId,
      workspaceId,
    },
  });
  await logAudit({
    actorId: userId,
    action: "AI_SPLIT_GENERATE",
    targetWorkspaceId: workspaceId,
    metadata: { suggestionId: saved.id, taskId, splitCount: result.suggestions.length },
  });
  return { suggestions: result.suggestions, suggestionId: saved.id };
}

export async function generateAiSuggestion(params: {
  userId: string;
  workspaceId: string;
  input: AiSuggestInput;
}) {
  const { userId, workspaceId, input } = params;
  const title = input.title || "タスク";
  const description = input.description ?? "";
  const taskId = input.taskId ?? null;
  await ensureTaskExists(workspaceId, taskId);

  let suggestion: string | null = null;
  let source = "canned";
  try {
    const result = await requestAiChat({
      system: "あなたはアジャイルなタスク分解のアシスタントです。",
      user: `タスクを短く分解し、緊急度や依存を意識した提案を1文でください: ${title}`,
      maxTokens: 80,
      context: {
        action: "AI_SUGGEST",
        userId,
        workspaceId,
        taskId,
        source: "ai-suggest",
      },
    });
    if (result?.content) {
      suggestion = result.content;
      source = "ai";
    }
  } catch {
    // Provider failures intentionally use a canned suggestion.
  }
  suggestion ??= cannedSuggestions[Math.floor(Math.random() * cannedSuggestions.length)];
  const saved = await prisma.aiSuggestion.create({
    data: {
      type: "TIP",
      taskId,
      inputTitle: title,
      inputDescription: description,
      output: suggestion,
      userId,
      workspaceId,
    },
  });
  await logAudit({
    actorId: userId,
    action: "AI_TIP_GENERATE",
    targetWorkspaceId: workspaceId,
    metadata: { suggestionId: saved.id, taskId, source },
  });
  return { suggestion, suggestionId: saved.id };
}

export async function getLatestAiSuggestion(workspaceId: string, taskId: string) {
  const latest = await prisma.aiSuggestion.findFirst({
    where: { taskId, workspaceId, type: "TIP" },
    orderBy: { createdAt: "desc" },
    select: { id: true, output: true },
  });
  return { suggestion: latest?.output ?? null, suggestionId: latest?.id ?? null };
}
