import { Prisma, type TaskType } from "@prisma/client";
import { normalizeSeverity, normalizeStoryPoint } from "../../../lib/ai-normalization";
import { requestAiChat } from "../../../lib/ai-provider";
import { generateSplitSuggestions } from "../../../lib/ai-suggestions";
import prisma from "../../../lib/prisma";
import { TASK_TYPE } from "../../../lib/types";
import { ApplicationError } from "../../shared/application/application-error";
import type { AiOperationsPort, AiPrepType } from "../application/ai-operations";

const badRequest = (message: string) =>
  new ApplicationError("AI_BAD_REQUEST", message, "bad_request");

const prepPrompts: Record<
  AiPrepType,
  {
    system: string;
    user: (title: string, description: string) => string;
    fallback: (title: string) => string;
  }
> = {
  EMAIL: {
    system: "あなたは丁寧で簡潔なメール作成アシスタントです。",
    user: (title, description) =>
      `次のタスクに関する短いメール草案を作成してください。件名と本文を含め、箇条書きは3点まで。\n\nタイトル: ${title}\n概要: ${description}`,
    fallback: (title) =>
      `件名: ${title} の共有\n\n関係者各位\n\n${title} について進めています。必要事項の確認をお願いします。\n- 目的/背景\n- 次のアクション\n- 期限\n\n以上、よろしくお願いします。`,
  },
  IMPLEMENTATION: {
    system: "あなたは実装計画の作成アシスタントです。",
    user: (title, description) =>
      `次のタスクの実装手順を5ステップ以内で作成してください。\n\nタイトル: ${title}\n概要: ${description}`,
    fallback: (title) =>
      `実装ステップ案\n1. ${title} の要件を整理\n2. 影響範囲を洗い出す\n3. 実装方針を決める\n4. 実装と自己テスト\n5. レビュー/確認`,
  },
  CHECKLIST: {
    system: "あなたはタスク実行のためのチェックリスト作成アシスタントです。",
    user: (title, description) =>
      `次のタスクを完了するためのチェックリストを作成してください。最大8項目。\n\nタイトル: ${title}\n概要: ${description}`,
    fallback: (title) =>
      `${title} のチェックリスト\n- 目的と完了条件を明確化\n- 必要な資料や依存を確認\n- 進め方を決める\n- 実行\n- 完了報告`,
  },
};

const generatePrepText = async (input: {
  type: AiPrepType;
  task: { id: string; title: string; description: string | null };
  userId: string;
  workspaceId: string;
  source?: string;
}) => {
  const prompt = prepPrompts[input.type];
  let output = prompt.fallback(input.task.title);
  try {
    const result = await requestAiChat({
      system: prompt.system,
      user: prompt.user(input.task.title, input.task.description ?? ""),
      maxTokens: 220,
      context: {
        action: "AI_PREP",
        userId: input.userId,
        workspaceId: input.workspaceId,
        taskId: input.task.id,
        source: input.source ?? `ai-prep:${input.type}`,
      },
    });
    if (result?.content) output = result.content.trim();
  } catch {
    // Provider failures intentionally degrade to a local template.
  }
  return output;
};

const prepTypeLabels: Record<string, string> = {
  CHECKLIST: "チェックリスト",
  IMPLEMENTATION: "実装手順",
  EMAIL: "メール草案",
};
const buildAppendix = (type: string, prepId: string, output: string) =>
  `\n\n---\nAI下準備: ${prepTypeLabels[type] ?? type}<!-- prep:${prepId} -->\n${output}`;

const ensureTaskExists = async (workspaceId: string, taskId?: string | null) => {
  if (!taskId) return;
  const task = await prisma.task.findFirst({
    where: { id: taskId, workspaceId },
    select: { id: true },
  });
  if (!task) throw badRequest("invalid taskId");
};

const fallbackEstimate = (title: string, description: string) => {
  const base = title.length + description.length;
  const points = base > 120 ? 8 : base > 60 ? 5 : base > 20 ? 3 : 1;
  const urgent = /今日|至急|締切|すぐ/.test(`${title}${description}`);
  const risky = /依存|外部|不確実|未知|調査/.test(`${title}${description}`);
  return {
    points,
    urgency: urgent ? "HIGH" : "MEDIUM",
    risk: risky ? "HIGH" : "MEDIUM",
    score: Math.min(95, Math.max(15, Math.round(points * 9 + (urgent ? 10 : 0)))),
    reason: "簡易ヒューリスティックで推定",
  };
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

export const prismaAiOperationsPort: AiOperationsPort = {
  async loadContext(userId, workspaceId) {
    const keys = ["ai_tip_accept_rate_30d", "ai_score_accept_rate_30d", "ai_split_accept_rate_30d"];
    const [flowType, wipCount, rateTypes, latency] = await Promise.all([
      workspaceId
        ? prisma.memoryDefinition.findFirst({
            where: { key: "flow_state", scope: "WORKSPACE" },
            select: { id: true },
          })
        : null,
      workspaceId ? prisma.task.count({ where: { workspaceId, status: "SPRINT" } }) : 0,
      prisma.memoryDefinition.findMany({
        where: { key: { in: keys }, scope: "USER" },
        select: { id: true, key: true },
        take: keys.length,
      }),
      prisma.aiSuggestionReaction.aggregate({
        where: {
          userId,
          latencyMs: { not: null },
          createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
        _avg: { latencyMs: true },
      }),
    ]);
    const [flowClaim, rateClaims] = await Promise.all([
      workspaceId && flowType
        ? prisma.memoryClaim.findFirst({
            where: { definitionId: flowType.id, workspaceId, status: "ACTIVE" },
            orderBy: { updatedAt: "desc" },
            select: { valueNum: true },
          })
        : null,
      rateTypes.length
        ? prisma.memoryClaim.findMany({
            where: {
              userId,
              status: "ACTIVE",
              definitionId: { in: rateTypes.map(({ id }) => id) },
            },
            orderBy: { updatedAt: "desc" },
            take: keys.length,
            select: { definitionId: true, valueNum: true },
          })
        : [],
    ]);
    const keyById = new Map(rateTypes.map(({ id, key }) => [id, key]));
    const acceptRates = { tip: null, score: null, split: null } as {
      tip: number | null;
      score: number | null;
      split: number | null;
    };
    for (const claim of rateClaims) {
      const key = keyById.get(claim.definitionId);
      if (key === keys[0]) acceptRates.tip = claim.valueNum;
      if (key === keys[1]) acceptRates.score = claim.valueNum;
      if (key === keys[2]) acceptRates.split = claim.valueNum;
    }
    return {
      flowState: flowClaim?.valueNum ?? null,
      wipCount,
      acceptRates,
      avgLatencyMs: latency._avg.latencyMs ?? null,
    };
  },

  listLogs(workspaceId) {
    return prisma.aiSuggestion.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
  },

  listPrep(workspaceId, taskId) {
    return prisma.aiPrepOutput.findMany({
      where: { taskId, workspaceId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, type: true, status: true, output: true, createdAt: true },
    });
  },

  async generatePrep(input) {
    const task = await prisma.task.findFirst({
      where: { id: input.taskId, workspaceId: input.workspaceId },
      select: { id: true, title: true, description: true },
    });
    if (!task) throw badRequest("invalid taskId");
    const output = await generatePrepText({ ...input, task });
    return prisma.$transaction(async (tx) => {
      const saved = await tx.aiPrepOutput.create({
        data: {
          taskId: task.id,
          type: input.type,
          output,
          userId: input.userId,
          workspaceId: input.workspaceId,
        },
      });
      if (input.audit !== false) {
        await tx.auditLog.create({
          data: {
            actorId: input.userId,
            action: "AI_PREP_GENERATE",
            targetWorkspaceId: input.workspaceId,
            metadata: { taskId: task.id, type: input.type },
          },
        });
      }
      return saved;
    });
  },

  actOnPrep(input) {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.aiPrepOutput.findFirst({
        where: { id: input.prepId, workspaceId: input.workspaceId },
        include: { task: { select: { id: true, description: true } } },
      });
      if (!existing) throw badRequest("invalid prep output");
      if (!existing.task) throw badRequest("task not found");
      let status = existing.status;
      let description = existing.task.description ?? "";
      const appendix = buildAppendix(existing.type, existing.id, existing.output);
      if (input.action === "approve") status = "APPROVED";
      if (input.action === "reject") status = "REJECTED";
      if (input.action === "apply") {
        if (existing.status === "REJECTED") throw badRequest("rejected output cannot be applied");
        if (!description.includes(appendix)) description += appendix;
        status = "APPLIED";
      }
      if (input.action === "revert") {
        description = description.replace(appendix, "");
        status = "APPROVED";
      }
      if (description !== existing.task.description) {
        await tx.task.update({
          where: { id: existing.task.id },
          data: { description },
        });
      }
      const updated = await tx.aiPrepOutput.update({
        where: { id: existing.id },
        data: { status },
      });
      await tx.auditLog.create({
        data: {
          actorId: input.userId,
          action: "AI_PREP_ACTION",
          targetWorkspaceId: input.workspaceId,
          metadata: {
            taskId: existing.task.id,
            prepId: existing.id,
            type: existing.type,
            action: input.action,
            source: "ai-prep",
          },
        },
      });
      return updated;
    });
  },

  async recordReaction(input) {
    const viewedAt = input.viewedAt ? new Date(input.viewedAt) : null;
    const reactedAt = input.reactedAt ? new Date(input.reactedAt) : null;
    if (viewedAt && reactedAt && reactedAt < viewedAt) {
      throw badRequest("reactedAt must not be before viewedAt");
    }
    await prisma.$transaction(async (tx) => {
      const suggestion = await tx.aiSuggestion.findFirst({
        where: {
          id: input.suggestionId,
          OR: [{ workspaceId: input.workspaceId }, { workspaceId: null }],
        },
        select: { id: true, type: true, workspaceId: true },
      });
      if (!suggestion) throw badRequest("invalid suggestionId");
      const taskType = Object.values(TASK_TYPE).includes(input.context?.taskType as TaskType)
        ? (input.context?.taskType as TaskType)
        : null;
      await tx.aiSuggestionReaction.create({
        data: {
          suggestionId: input.suggestionId,
          reaction: input.reaction,
          taskType,
          taskPoints: input.context?.taskPoints ?? null,
          hourOfDay: input.context?.hourOfDay ?? null,
          dayOfWeek: input.context?.dayOfWeek ?? null,
          wipCount: input.context?.wipCount ?? null,
          flowState: input.context?.flowState ?? null,
          modification: (input.modification ?? Prisma.DbNull) as Prisma.InputJsonValue,
          viewedAt,
          reactedAt,
          latencyMs: viewedAt && reactedAt ? reactedAt.getTime() - viewedAt.getTime() : null,
          userId: input.userId,
          workspaceId: suggestion.workspaceId,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: input.userId,
          action: "AI_SUGGESTION_REACTION",
          targetWorkspaceId: suggestion.workspaceId,
          metadata: {
            suggestionId: suggestion.id,
            reaction: input.reaction,
            suggestionType: suggestion.type,
          },
        },
      });
      if (input.reaction === "VIEWED") return;

      const definition = await tx.memoryDefinition.findFirst({
        where: { key: `ai_${suggestion.type.toLowerCase()}_accept_rate_30d`, scope: "USER" },
      });
      if (!definition) return;
      const claim = await tx.memoryClaim.findFirst({
        where: { definitionId: definition.id, userId: input.userId, status: "ACTIVE" },
      });
      const alpha = 1 - 2 ** (-1 / (definition.decayDays ?? 30));
      const accepted = input.reaction === "ACCEPTED" || input.reaction === "MODIFIED" ? 1 : 0;
      const valueNum = alpha * accepted + (1 - alpha) * (claim?.valueNum ?? 0.5);
      if (claim) {
        await tx.memoryClaim.update({ where: { id: claim.id }, data: { valueNum } });
      } else {
        await tx.memoryClaim.create({
          data: {
            definitionId: definition.id,
            userId: input.userId,
            valueNum,
            provenance: "INFERRED",
            status: "ACTIVE",
          },
        });
      }
    });
  },

  async generateScore(actor, input) {
    const description = input.description ?? "";
    const taskId = input.taskId ?? null;
    await ensureTaskExists(actor.workspaceId, taskId);
    let payload: Record<string, unknown> = fallbackEstimate(input.title, description);
    try {
      const result = await requestAiChat({
        system: "あなたはアジャイルなタスク見積もりアシスタントです。JSONのみで返してください。",
        user: `以下を見積もり、JSONで返してください: { "points": number(1-13), "urgency": "低|中|高", "risk": "低|中|高", "score": number(0-100), "reason": string }。\nタイトル: ${input.title}\n説明: ${description}`,
        maxTokens: 120,
        context: {
          action: "AI_SCORE",
          ...actor,
          taskId,
          source: "ai-score",
        },
      });
      if (result?.content) {
        const parsed = JSON.parse(extractJson(result.content));
        if (parsed?.points) payload = parsed;
      }
    } catch {
      // Provider failures use the deterministic estimate.
    }
    const rawScore = Number(payload.score);
    const normalized = {
      points: normalizeStoryPoint(payload.points),
      urgency: normalizeSeverity(payload.urgency),
      risk: normalizeSeverity(payload.risk),
      score: Number.isFinite(rawScore) ? Math.min(100, Math.max(0, Math.round(rawScore))) : 0,
      reason: (typeof payload.reason === "string" ? payload.reason : "").slice(0, 500),
    };
    const saved = await prisma.$transaction(async (tx) => {
      const suggestion = await tx.aiSuggestion.create({
        data: {
          type: "SCORE",
          taskId,
          inputTitle: input.title,
          inputDescription: description,
          output: JSON.stringify(normalized),
          ...actor,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.userId,
          action: "AI_SCORE_GENERATE",
          targetWorkspaceId: actor.workspaceId,
          metadata: { suggestionId: suggestion.id, taskId },
        },
      });
      return suggestion;
    });
    return { ...normalized, suggestionId: saved.id };
  },

  async generateSplit(actor, input) {
    const description = input.description ?? "";
    const taskId = input.taskId ?? null;
    await ensureTaskExists(actor.workspaceId, taskId);
    const result = await generateSplitSuggestions({
      title: input.title,
      description,
      points: input.points,
      context: { action: "AI_SPLIT", ...actor, taskId, source: "ai-split" },
    });
    const saved = await prisma.$transaction(async (tx) => {
      const suggestion = await tx.aiSuggestion.create({
        data: {
          type: "SPLIT",
          taskId,
          inputTitle: input.title,
          inputDescription: description,
          output: JSON.stringify(result.suggestions),
          ...actor,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.userId,
          action: "AI_SPLIT_GENERATE",
          targetWorkspaceId: actor.workspaceId,
          metadata: {
            suggestionId: suggestion.id,
            taskId,
            splitCount: result.suggestions.length,
          },
        },
      });
      return suggestion;
    });
    return { suggestions: result.suggestions, suggestionId: saved.id };
  },

  async generateSuggestion(actor, input) {
    const title = input.title || "タスク";
    const description = input.description ?? "";
    const taskId = input.taskId ?? null;
    await ensureTaskExists(actor.workspaceId, taskId);
    let suggestion: string | null = null;
    let source = "canned";
    try {
      const result = await requestAiChat({
        system: "あなたはアジャイルなタスク分解のアシスタントです。",
        user: `タスクを短く分解し、緊急度や依存を意識した提案を1文でください: ${title}`,
        maxTokens: 80,
        context: { action: "AI_SUGGEST", ...actor, taskId, source: "ai-suggest" },
      });
      if (result?.content) {
        suggestion = result.content;
        source = "ai";
      }
    } catch {
      // Provider failures use a canned suggestion.
    }
    suggestion ??= cannedSuggestions[Math.floor(Math.random() * cannedSuggestions.length)];
    const saved = await prisma.$transaction(async (tx) => {
      const row = await tx.aiSuggestion.create({
        data: {
          type: "TIP",
          taskId,
          inputTitle: title,
          inputDescription: description,
          output: suggestion,
          ...actor,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.userId,
          action: "AI_TIP_GENERATE",
          targetWorkspaceId: actor.workspaceId,
          metadata: { suggestionId: row.id, taskId, source },
        },
      });
      return row;
    });
    return { suggestion, suggestionId: saved.id };
  },

  async latestSuggestion(workspaceId, taskId) {
    const latest = await prisma.aiSuggestion.findFirst({
      where: { taskId, workspaceId, type: "TIP" },
      orderBy: { createdAt: "desc" },
      select: { id: true, output: true },
    });
    return { suggestion: latest?.output ?? null, suggestionId: latest?.id ?? null };
  },
};
