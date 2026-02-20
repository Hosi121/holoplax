import { Prisma, type SuggestionReaction, type TaskType } from "@prisma/client";
import { requireWorkspaceAuth } from "../../../../lib/api-guards";
import { withApiHandler } from "../../../../lib/api-handler";
import { ok } from "../../../../lib/api-response";
import { logAudit } from "../../../../lib/audit";
import { AiReactionSchema } from "../../../../lib/contracts/ai";
import { createDomainErrors } from "../../../../lib/http/errors";
import { parseBody } from "../../../../lib/http/validation";
import prisma from "../../../../lib/prisma";
import { TASK_TYPE } from "../../../../lib/types";

const errors = createDomainErrors("AI");

const isTaskType = (value: unknown): value is TaskType =>
  Object.values(TASK_TYPE).includes(value as TaskType);

export async function POST(request: Request) {
  return withApiHandler(
    {
      logLabel: "POST /api/ai/reaction",
      errorFallback: {
        code: "AI_INTERNAL",
        message: "failed to record reaction",
        status: 500,
      },
    },
    async () => {
      const { userId } = await requireWorkspaceAuth({
        domain: "AI",
        requireWorkspace: false,
      });
      const body = await parseBody(request, AiReactionSchema, { code: "AI_VALIDATION" });
      const { suggestionId, reaction, context, modification, viewedAt, reactedAt } = body;

      // 該当のSuggestionが存在するか確認
      const suggestion = await prisma.aiSuggestion.findUnique({
        where: { id: suggestionId },
        select: { id: true, type: true, workspaceId: true },
      });
      if (!suggestion) {
        return errors.badRequest("invalid suggestionId");
      }

      // タイミング情報の計算
      const viewedDate = viewedAt ? new Date(viewedAt) : null;
      const reactedDate = reactedAt ? new Date(reactedAt) : null;
      const latencyMs =
        viewedDate && reactedDate ? reactedDate.getTime() - viewedDate.getTime() : null;

      // 反応の記録
      await prisma.aiSuggestionReaction.create({
        data: {
          suggestionId,
          reaction: reaction as SuggestionReaction,
          taskType: context?.taskType && isTaskType(context.taskType) ? context.taskType : null,
          taskPoints: context?.taskPoints ?? null,
          hourOfDay: context?.hourOfDay ?? null,
          dayOfWeek: context?.dayOfWeek ?? null,
          wipCount: context?.wipCount ?? null,
          flowState: context?.flowState ?? null,
          modification: modification ?? Prisma.DbNull,
          viewedAt: viewedDate,
          reactedAt: reactedDate,
          latencyMs,
          userId,
          workspaceId: suggestion.workspaceId,
        },
      });

      await logAudit({
        actorId: userId,
        action: "AI_SUGGESTION_REACTION",
        targetWorkspaceId: suggestion.workspaceId ?? undefined,
        metadata: { suggestionId, reaction, suggestionType: suggestion.type },
      });

      // VIEWED以外の反応は即座にEMA更新（オプショナル、将来の拡張用）
      if (reaction !== "VIEWED") {
        await updateAcceptRateEMA(userId, suggestion.type, reaction);
      }

      return ok({ recorded: true });
    },
  );
}

/**
 * EMAベースで受容率を即時更新する
 * typeKey: ai_{type}_accept_rate_30d
 */
async function updateAcceptRateEMA(userId: string, suggestionType: string, reaction: string) {
  const typeKey = `ai_${suggestionType.toLowerCase()}_accept_rate_30d`;
  const memoryType = await prisma.memoryType.findFirst({
    where: { key: typeKey, scope: "USER" },
  });
  if (!memoryType) {
    // MemoryTypeが未定義の場合はスキップ（Phase 2で追加予定）
    return;
  }

  const claim = await prisma.memoryClaim.findFirst({
    where: { typeId: memoryType.id, userId, status: "ACTIVE" },
  });

  // EMA: alpha = 1 - 2^(-1/decayDays)
  const decayDays = memoryType.decayDays ?? 30;
  const alpha = 1 - 2 ** (-1 / decayDays);
  const newValue = reaction === "ACCEPTED" || reaction === "MODIFIED" ? 1 : 0;
  const prevValue = claim?.valueNum ?? 0.5; // 初期値は50%
  const nextValue = alpha * newValue + (1 - alpha) * prevValue;

  if (claim) {
    await prisma.memoryClaim.update({
      where: { id: claim.id },
      data: { valueNum: nextValue, updatedAt: new Date() },
    });
  } else {
    await prisma.memoryClaim.create({
      data: {
        typeId: memoryType.id,
        userId,
        valueNum: nextValue,
        source: "INFERRED",
        status: "ACTIVE",
      },
    });
  }
}
