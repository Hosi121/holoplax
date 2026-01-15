import { requireAuth } from "../../../../lib/api-auth";
import {
  badRequest,
  handleAuthError,
  ok,
  serverError,
} from "../../../../lib/api-response";
import prisma from "../../../../lib/prisma";

const fallbackEstimate = (title: string, description: string) => {
  const base = title.length + description.length;
  const points = base > 120 ? 8 : base > 60 ? 5 : base > 20 ? 3 : 1;
  const urgency = /今日|至急|締切|すぐ/.test(`${title}${description}`) ? "高" : "中";
  const risk = /依存|外部|不確実|未知|調査/.test(`${title}${description}`) ? "高" : "中";
  const score = Math.min(95, Math.max(15, Math.round(points * 9 + (urgency === "高" ? 10 : 0))));
  return { points, urgency, risk, score, reason: "簡易ヒューリスティックで推定" };
};

const extractJson = (text: string) => {
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) {
    return text.slice(first, last + 1);
  }
  return text;
};

export async function POST(request: Request) {
  try {
    const { userId } = await requireAuth();
    const body = await request.json();
    const title = String(body.title ?? "").trim();
    const description = String(body.description ?? "").trim();
    if (!title) {
      return badRequest("title is required");
    }

    const apiKey = process.env.OPENAI_API_KEY;
    let payload = fallbackEstimate(title, description);

    if (apiKey) {
      try {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              {
                role: "system",
                content:
                  "あなたはアジャイルなタスク見積もりアシスタントです。JSONのみで返してください。",
              },
              {
                role: "user",
                content: `以下を見積もり、JSONで返してください: { "points": number(1-13), "urgency": "低|中|高", "risk": "低|中|高", "score": number(0-100), "reason": string }。\nタイトル: ${title}\n説明: ${description}`,
              },
            ],
            max_tokens: 120,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const content = data.choices?.[0]?.message?.content;
          if (content) {
            const parsed = JSON.parse(extractJson(content));
            if (parsed?.points) payload = parsed;
          }
        }
      } catch {
        // fall back to heuristic
      }
    }

    await prisma.aiSuggestion.create({
      data: {
        type: "SCORE",
        taskId: body.taskId ?? null,
        inputTitle: title,
        inputDescription: description,
        output: JSON.stringify(payload),
        userId,
      },
    });

    return ok(payload);
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    console.error("POST /api/ai/score error", error);
    return serverError("failed to estimate score");
  }
}
