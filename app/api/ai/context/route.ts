import { requireWorkspaceAuth } from "../../../../lib/api-guards";
import { withApiHandler } from "../../../../lib/api-handler";
import { ok } from "../../../../lib/api-response";
import prisma from "../../../../lib/prisma";

type SuggestionType = "TIP" | "SCORE" | "SPLIT";

type Recommendation = {
  type: SuggestionType;
  reason: string;
  confidence: number;
};

type AiContextResponse = {
  flowState: number | null;
  wipCount: number;
  acceptRates: {
    tip: number | null;
    score: number | null;
    split: number | null;
  };
  avgLatencyMs: number | null;
  recommendations: Recommendation[];
};

export async function GET() {
  return withApiHandler(
    {
      logLabel: "GET /api/ai/context",
      errorFallback: {
        code: "AI_INTERNAL",
        message: "failed to get AI context",
        status: 500,
      },
    },
    async () => {
      const { userId, workspaceId } = await requireWorkspaceAuth({
        domain: "AI",
        requireWorkspace: false,
      });

      // 1. flow_state を MemoryClaim から取得
      let flowState: number | null = null;
      if (workspaceId) {
        const flowType = await prisma.memoryType.findFirst({
          where: { key: "flow_state", scope: "WORKSPACE" },
        });
        if (flowType) {
          const flowClaim = await prisma.memoryClaim.findFirst({
            where: {
              typeId: flowType.id,
              workspaceId,
              status: "ACTIVE",
            },
            orderBy: { updatedAt: "desc" },
          });
          flowState = flowClaim?.valueNum ?? null;
        }
      }

      // 2. WIP数をリアルタイム計算
      const wipCount = workspaceId
        ? await prisma.task.count({
            where: { workspaceId, status: "SPRINT" },
          })
        : 0;

      // 3. 受容率を MemoryClaim から取得
      const acceptRateKeys = [
        "ai_tip_accept_rate_30d",
        "ai_score_accept_rate_30d",
        "ai_split_accept_rate_30d",
      ];
      const acceptRateTypes = await prisma.memoryType.findMany({
        where: { key: { in: acceptRateKeys }, scope: "USER" },
        take: acceptRateKeys.length,
      });
      const typeIdToKey = new Map(acceptRateTypes.map((t) => [t.id, t.key]));

      const acceptRateClaims = await prisma.memoryClaim.findMany({
        where: {
          userId,
          status: "ACTIVE",
          typeId: { in: acceptRateTypes.map((t) => t.id) },
        },
        orderBy: { updatedAt: "desc" },
        take: acceptRateKeys.length,
      });

      const acceptRates: AiContextResponse["acceptRates"] = {
        tip: null,
        score: null,
        split: null,
      };
      for (const claim of acceptRateClaims) {
        const key = typeIdToKey.get(claim.typeId);
        if (key === "ai_tip_accept_rate_30d") acceptRates.tip = claim.valueNum;
        if (key === "ai_score_accept_rate_30d") acceptRates.score = claim.valueNum;
        if (key === "ai_split_accept_rate_30d") acceptRates.split = claim.valueNum;
      }

      // 4. 平均反応時間
      const latencyAgg = await prisma.aiSuggestionReaction.aggregate({
        where: {
          userId,
          latencyMs: { not: null },
          createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        },
        _avg: { latencyMs: true },
      });
      const avgLatencyMs = latencyAgg._avg.latencyMs ?? null;

      // 5. 推奨を計算
      const recommendations = computeRecommendations({
        flowState,
        wipCount,
        acceptRates,
      });

      const response: AiContextResponse = {
        flowState,
        wipCount,
        acceptRates,
        avgLatencyMs,
        recommendations,
      };

      return ok(response);
    },
  );
}

function computeRecommendations(ctx: {
  flowState: number | null;
  wipCount: number;
  acceptRates: AiContextResponse["acceptRates"];
}): Recommendation[] {
  const recommendations: Recommendation[] = [];
  const { flowState, wipCount, acceptRates } = ctx;

  // WIPが多すぎる場合は提案を抑制
  if (wipCount > 5) {
    return [];
  }

  // SPLIT: 受容率が高い場合に推奨
  const splitRate = acceptRates.split ?? 0.5;
  if (splitRate >= 0.3) {
    recommendations.push({
      type: "SPLIT",
      reason: "高ポイントタスクの分解で作業を進めやすくします",
      confidence: splitRate,
    });
  }

  // SCORE: 受容率に基づく
  const scoreRate = acceptRates.score ?? 0.5;
  if (scoreRate >= 0.3) {
    recommendations.push({
      type: "SCORE",
      reason: "ポイント未設定のタスクに見積もりを提案します",
      confidence: scoreRate,
    });
  }

  // TIP: flow_stateが低い時（詰まってる時）に推奨
  const tipRate = acceptRates.tip ?? 0.5;
  if (tipRate >= 0.3 && (flowState === null || flowState < 0.4)) {
    recommendations.push({
      type: "TIP",
      reason: "作業の進め方についてヒントを提案します",
      confidence: tipRate,
    });
  }

  // confidence でソート
  recommendations.sort((a, b) => b.confidence - a.confidence);

  return recommendations;
}
