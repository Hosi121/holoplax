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
    points: idx === count - 1 ? Math.max(1, points - basePoints * (count - 1)) : basePoints,
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
  source: "openai" | "fallback";
};

export async function generateSplitSuggestions(params: {
  title: string;
  description: string;
  points: number;
}): Promise<SplitSuggestionResult> {
  const { title, description, points } = params;
  let suggestions = fallbackSplit(title, description, points);
  let usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | undefined;
  let usedAi = false;
  const model = "gpt-4o-mini";
  const apiKey = process.env.OPENAI_API_KEY;

  if (apiKey) {
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content: "あなたはタスク分解アシスタントです。JSON配列のみで返してください。",
            },
            {
              role: "user",
              content: `以下のタスクを2-4件に分解し、JSON配列で返してください: [{ "title": string, "points": number, "urgency": "低|中|高", "risk": "低|中|高", "detail": string }]\nタイトル: ${title}\n説明: ${description}\nポイント: ${points}`,
            },
          ],
          max_tokens: 220,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        usedAi = true;
        usage = data.usage ?? undefined;
        const content = data.choices?.[0]?.message?.content;
        if (content) {
          const parsed = JSON.parse(extractJsonArray(content));
          if (Array.isArray(parsed) && parsed.length > 0) suggestions = parsed;
        }
      }
    } catch {
      // fall back to heuristic
    }
  }

  return {
    suggestions,
    usage,
    model,
    source: usedAi ? "openai" : "fallback",
  };
}
