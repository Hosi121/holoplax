import { normalizeSeverity, normalizeStoryPoint } from "../../../../lib/ai-normalization";
import { requestAiChat } from "../../../../lib/ai-provider";
import { requireWorkspaceAuth } from "../../../../lib/api-guards";
import { withApiHandler } from "../../../../lib/api-handler";
import { ok } from "../../../../lib/api-response";
import { logAudit } from "../../../../lib/audit";
import { AiScoreSchema } from "../../../../lib/contracts/ai";
import { createDomainErrors } from "../../../../lib/http/errors";
import { parseBody } from "../../../../lib/http/validation";
import prisma from "../../../../lib/prisma";
import { SEVERITY } from "../../../../lib/types";

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
  if (first >= 0 && last > first) {
    return text.slice(first, last + 1);
  }
  return text;
};
const errors = createDomainErrors("AI");

export async function POST(request: Request) {
  return withApiHandler(
    {
      logLabel: "POST /api/ai/score",
      errorFallback: {
        code: "AI_INTERNAL",
        message: "failed to estimate score",
        status: 500,
      },
    },
    async () => {
      const { userId, workspaceId } = await requireWorkspaceAuth({
        domain: "AI",
        requireWorkspace: true,
      });
      const body = await parseBody(request, AiScoreSchema, { code: "AI_VALIDATION" });
      const title = body.title;
      const description = body.description ?? "";
      const taskId = body.taskId ?? null;
      if (taskId) {
        const task = await prisma.task.findFirst({
          where: { id: taskId, workspaceId },
          select: { id: true },
        });
        if (!task) {
          return errors.badRequest("invalid taskId");
        }
      }

      let payload = fallbackEstimate(title, description);

      try {
        const result = await requestAiChat({
          system: "あなたはアジャイルなタスク見積もりアシスタントです。JSONのみで返してください。",
          user: `以下を見積もり、JSONで返してください: { "points": number(1-13), "urgency": "低|中|高", "risk": "低|中|高", "score": number(0-100), "reason": string }。\nタイトル: ${title}\n説明: ${description}`,
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
        // fall back to heuristic
      }

      // Build the persisted payload from a fixed whitelist — never spread the
      // raw (untrusted, possibly prompt-injected) model output. score is
      // coerced and clamped to 0–100; reason is coerced to a bounded string.
      const rawScore = Number((payload as { score?: unknown }).score);
      const score = Number.isFinite(rawScore)
        ? Math.min(100, Math.max(0, Math.round(rawScore)))
        : 0;
      const rawReason = (payload as { reason?: unknown }).reason;
      const reason = (typeof rawReason === "string" ? rawReason : "").slice(0, 500);
      const normalizedPayload = {
        points: normalizeStoryPoint(payload.points),
        urgency: normalizeSeverity(payload.urgency),
        risk: normalizeSeverity(payload.risk),
        score,
        reason,
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

      await logAudit({
        actorId: userId,
        action: "AI_SCORE_GENERATE",
        targetWorkspaceId: workspaceId,
        metadata: { suggestionId: saved.id, taskId },
      });
      return ok({ ...normalizedPayload, suggestionId: saved.id });
    },
  );
}
