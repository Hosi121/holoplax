import { requireAuth } from "../../../../lib/api-auth";
import {
  badRequest,
  handleAuthError,
  ok,
  serverError,
} from "../../../../lib/api-response";
import { buildAiUsageMetadata } from "../../../../lib/ai-usage";
import { logAudit } from "../../../../lib/audit";
import { requestAiChat } from "../../../../lib/ai-provider";
import prisma from "../../../../lib/prisma";
import { resolveWorkspaceId } from "../../../../lib/workspace-context";

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
    const workspaceId = await resolveWorkspaceId(userId);
    if (!workspaceId) {
      return badRequest("workspace is required");
    }
    const body = await request.json();
    const title = String(body.title ?? "").trim();
    const description = String(body.description ?? "").trim();
    const taskId = body.taskId ?? null;
    if (!title) {
      return badRequest("title is required");
    }
    if (taskId) {
      const task = await prisma.task.findFirst({
        where: { id: taskId, workspaceId },
        select: { id: true },
      });
      if (!task) {
        return badRequest("invalid taskId");
      }
    }

    let payload = fallbackEstimate(title, description);

    try {
      const result = await requestAiChat({
        system:
          "あなたはアジャイルなタスク見積もりアシスタントです。JSONのみで返してください。",
        user: `以下を見積もり、JSONで返してください: { "points": number(1-13), "urgency": "低|中|高", "risk": "低|中|高", "score": number(0-100), "reason": string }。\nタイトル: ${title}\n説明: ${description}`,
        maxTokens: 120,
      });
      if (result?.usage) {
        const usageMeta = buildAiUsageMetadata(
          result.provider,
          result.model,
          result.usage,
        );
        if (usageMeta) {
          await logAudit({
            actorId: userId,
            action: "AI_SCORE",
            targetWorkspaceId: workspaceId,
            metadata: {
              ...usageMeta,
              taskId,
              source: "ai-score",
            },
          });
        }
      }
      if (result?.content) {
        const parsed = JSON.parse(extractJson(result.content));
        if (parsed?.points) payload = parsed;
      }
    } catch {
      // fall back to heuristic
    }

    await prisma.aiSuggestion.create({
      data: {
        type: "SCORE",
        taskId,
        inputTitle: title,
        inputDescription: description,
        output: JSON.stringify(payload),
        userId,
        workspaceId,
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
