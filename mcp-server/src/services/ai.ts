import { PrismaClient } from "@prisma/client";
import type { ExecutionContext } from "../context.js";

const prisma = new PrismaClient();

// Type definitions matching Prisma schema
type Severity = "LOW" | "MEDIUM" | "HIGH";

const SEVERITY = {
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
} as const;

const FIBONACCI_POINTS = [1, 2, 3, 5, 8, 13, 21, 34] as const;
type FibonacciPoint = (typeof FIBONACCI_POINTS)[number];

function normalizeStoryPoint(value: unknown, fallback: FibonacciPoint = 3): FibonacciPoint {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  let closest: FibonacciPoint = FIBONACCI_POINTS[0];
  for (const point of FIBONACCI_POINTS) {
    if (Math.abs(point - num) < Math.abs(closest - num)) {
      closest = point;
    }
  }
  return closest;
}

function normalizeSeverity(value: unknown, fallback: Severity = SEVERITY.MEDIUM): Severity {
  if (typeof value !== "string") return fallback;
  const upper = value.toUpperCase();
  if (upper === "LOW" || upper === "低") return SEVERITY.LOW;
  if (upper === "HIGH" || upper === "高") return SEVERITY.HIGH;
  if (upper === "MEDIUM" || upper === "中") return SEVERITY.MEDIUM;
  return fallback;
}

export interface SplitItem {
  title: string;
  points: FibonacciPoint;
  urgency: Severity;
  risk: Severity;
  detail: string;
}

function sanitizeSplitSuggestion(item: unknown): SplitItem {
  const obj = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
  return {
    title: typeof obj.title === "string" ? obj.title : "分割タスク",
    points: normalizeStoryPoint(obj.points),
    urgency: normalizeSeverity(obj.urgency),
    risk: normalizeSeverity(obj.risk),
    detail: typeof obj.detail === "string" ? obj.detail : "",
  };
}

function fallbackEstimate(title: string, description: string) {
  const base = title.length + description.length;
  const points: FibonacciPoint = base > 120 ? 8 : base > 60 ? 5 : base > 20 ? 3 : 1;
  const isUrgent = /今日|至急|締切|すぐ/.test(`${title}${description}`);
  const isRisky = /依存|外部|不確実|未知|調査/.test(`${title}${description}`);
  const urgency = isUrgent ? SEVERITY.HIGH : SEVERITY.MEDIUM;
  const risk = isRisky ? SEVERITY.HIGH : SEVERITY.MEDIUM;
  const score = Math.min(95, Math.max(15, Math.round(points * 9 + (isUrgent ? 10 : 0))));
  return { points, urgency, risk, score, reason: "簡易ヒューリスティックで推定" };
}

function fallbackSplit(title: string, description: string, points: number): SplitItem[] {
  const basePoints = points > 8 ? Math.ceil(points / 3) : Math.max(1, Math.ceil(points / 2));
  const count = points > 8 ? 3 : 2;
  return Array.from({ length: count }, (_, idx) => ({
    title: `${title} / 分割${idx + 1}`,
    points:
      idx === count - 1
        ? normalizeStoryPoint(Math.max(1, points - basePoints * (count - 1)))
        : normalizeStoryPoint(basePoints),
    urgency: SEVERITY.MEDIUM,
    risk: description.includes("外部") ? SEVERITY.HIGH : SEVERITY.MEDIUM,
    detail: "小さく完了条件を定義し、依存を先に解消。",
  }));
}

const cannedSuggestions = [
  "小さく分けて今日30分以内に終わる粒度にしてください。",
  "外部依存を先に洗い出し、リスクを下げるタスクを先頭に置きましょう。",
  "完了条件を1文で定義し、レビュー手順を添えましょう。",
];

export interface AiScoreInput {
  title: string;
  description?: string;
  taskId?: string;
}

export async function aiScore(ctx: ExecutionContext, input: AiScoreInput) {
  const { userId, workspaceId } = ctx;
  const title = input.title;
  const description = input.description ?? "";
  const taskId = input.taskId ?? null;

  if (taskId) {
    const task = await prisma.task.findFirst({
      where: { id: taskId, workspaceId },
      select: { id: true },
    });
    if (!task) {
      throw new Error("invalid taskId");
    }
  }

  // Use fallback heuristic (AI provider requires complex setup)
  const payload = fallbackEstimate(title, description);

  const normalizedPayload = {
    ...payload,
    points: normalizeStoryPoint(payload.points),
    urgency: normalizeSeverity(payload.urgency),
    risk: normalizeSeverity(payload.risk),
  };

  const saved = await prisma.aiSuggestion.create({
    data: {
      type: "SCORE",
      taskId,
      inputTitle: title,
      inputDescription: description,
      output: JSON.stringify(normalizedPayload),
      userId,
      workspaceId,
    },
  });

  return { ...normalizedPayload, suggestionId: saved.id };
}

export interface AiSplitInput {
  title: string;
  description?: string;
  points: number;
  taskId?: string;
}

export async function aiSplit(ctx: ExecutionContext, input: AiSplitInput) {
  const { userId, workspaceId } = ctx;
  const title = input.title;
  const description = input.description ?? "";
  const points = input.points;
  const taskId = input.taskId ?? null;

  if (taskId) {
    const task = await prisma.task.findFirst({
      where: { id: taskId, workspaceId },
      select: { id: true },
    });
    if (!task) {
      throw new Error("invalid taskId");
    }
  }

  // Use fallback heuristic
  const suggestions = fallbackSplit(title, description, points).map(sanitizeSplitSuggestion);

  const saved = await prisma.aiSuggestion.create({
    data: {
      type: "SPLIT",
      taskId,
      inputTitle: title,
      inputDescription: description,
      output: JSON.stringify(suggestions),
      userId,
      workspaceId,
    },
  });

  return { suggestions, suggestionId: saved.id };
}

export interface AiSuggestInput {
  title?: string;
  description?: string;
  taskId?: string;
}

export async function aiSuggest(ctx: ExecutionContext, input: AiSuggestInput) {
  const { userId, workspaceId } = ctx;
  const title = input.title ?? "タスク";
  const description = input.description ?? "";
  const taskId = input.taskId ?? null;

  if (taskId) {
    const task = await prisma.task.findFirst({
      where: { id: taskId, workspaceId },
      select: { id: true },
    });
    if (!task) {
      throw new Error("invalid taskId");
    }
  }

  // Use canned suggestion (AI provider requires complex setup)
  const pick = cannedSuggestions[Math.floor(Math.random() * cannedSuggestions.length)];

  const saved = await prisma.aiSuggestion.create({
    data: {
      type: "TIP",
      taskId,
      inputTitle: title,
      inputDescription: description,
      output: pick,
      userId,
      workspaceId,
    },
  });

  return { suggestion: pick, suggestionId: saved.id };
}
