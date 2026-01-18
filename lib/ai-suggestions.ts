import { requestAiChat } from "./ai-provider";
import type { AiUsageContext } from "./ai-usage";
import { storyPointOptions } from "./points";
import { normalizeStoryPoint, sanitizeSplitSuggestion } from "./ai-normalization";

export type SplitItem = {
  title: string;
  points: number;
  urgency: string;
  risk: string;
  detail: string;
};

const fallbackSplit = (title: string, description: string, points: number): SplitItem[] => {
  const basePoints = points > 8 ? Math.ceil(points / 3) : Math.max(1, Math.ceil(points / 2));
  const count = points > 8 ? 3 : 2;
  return Array.from({ length: count }, (_, idx) => ({
    title: `${title} / 分割${idx + 1}`,
    points:
      idx === count - 1
        ? normalizeStoryPoint(Math.max(1, points - basePoints * (count - 1)))
        : normalizeStoryPoint(basePoints),
    urgency: "中",
    risk: description.includes("外部") ? "高" : "中",
    detail: "小さく完了条件を定義し、依存を先に解消。",
  }));
};

const extractJsonArray = (text: string) => {
  const first = text.indexOf("[");
  const last = text.lastIndexOf("]");
  if (first >= 0 && last > first) {
    return text.slice(first, last + 1);
  }
  return text;
};

export type SplitSuggestionResult = {
  suggestions: SplitItem[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  model: string;
  provider: string;
  source: "provider" | "fallback";
};

export async function generateSplitSuggestions(params: {
  title: string;
  description: string;
  points: number;
  context?: AiUsageContext;
}): Promise<SplitSuggestionResult> {
  const { title, description, points, context } = params;
  let suggestions = fallbackSplit(title, description, points);
  let usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined;
  let usedAi = false;
  let model = "fallback";
  let provider = "fallback";

  try {
    const result = await requestAiChat({
      system: "あなたはタスク分解アシスタントです。JSON配列のみで返してください。",
      user: `以下のタスクを2-4件に分解し、JSON配列で返してください: [{ "title": string, "points": number, "urgency": "低|中|高", "risk": "低|中|高", "detail": string }]\nポイントは必ずフィボナッチ数(1, 2, 3, 5, 8, 13, 21, 34)から選んでください。\nタイトル: ${title}\n説明: ${description}\nポイント: ${points}`,
      maxTokens: 220,
      context,
    });
    if (result?.content) {
      usedAi = true;
      usage = result.usage ?? undefined;
      model = result.model;
      provider = result.provider;
      const parsed = JSON.parse(extractJsonArray(result.content));
      if (Array.isArray(parsed) && parsed.length > 0) suggestions = parsed;
    }
  } catch {
    // fall back to heuristic
  }

  const normalized = suggestions.map(sanitizeSplitSuggestion);
  return {
    suggestions: normalized,
    usage,
    model,
    provider,
    source: usedAi ? "provider" : "fallback",
  };
}
