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

      const acceptRateKeys = [
        "ai_tip_accept_rate_30d",
        "ai_score_accept_rate_30d",
        "ai_split_accept_rate_30d",
      ];

      // The definitions, WIP count, and latency aggregate are independent.
      // Fetching them in one wave reduces this endpoint from six sequential
      // database round trips to two in the fully populated case.
      const [flowType, wipCount, acceptRateTypes, latencyAgg] = await Promise.all([
        workspaceId
          ? prisma.memoryDefinition.findFirst({
              where: { key: "flow_state", scope: "WORKSPACE" },
              select: { id: true },
            })
          : Promise.resolve(null),
        workspaceId
          ? prisma.task.count({ where: { workspaceId, status: "SPRINT" } })
          : Promise.resolve(0),
        prisma.memoryDefinition.findMany({
          where: { key: { in: acceptRateKeys }, scope: "USER" },
          take: acceptRateKeys.length,
          select: { id: true, key: true },
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

      const [flowClaim, acceptRateClaims] = await Promise.all([
        workspaceId && flowType
          ? prisma.memoryClaim.findFirst({
              where: {
                definitionId: flowType.id,
                workspaceId,
                status: "ACTIVE",
              },
              orderBy: { updatedAt: "desc" },
              select: { valueNum: true },
            })
          : Promise.resolve(null),
        acceptRateTypes.length
          ? prisma.memoryClaim.findMany({
              where: {
                userId,
                status: "ACTIVE",
                definitionId: { in: acceptRateTypes.map((type) => type.id) },
              },
              orderBy: { updatedAt: "desc" },
              take: acceptRateKeys.length,
              select: { definitionId: true, valueNum: true },
            })
          : Promise.resolve([]),
      ]);
      const flowState = flowClaim?.valueNum ?? null;
      const typeIdToKey = new Map(acceptRateTypes.map((t) => [t.id, t.key]));

      const acceptRates: AiContextResponse["acceptRates"] = {
        tip: null,
        score: null,
        split: null,
      };
      for (const claim of acceptRateClaims) {
        const key = typeIdToKey.get(claim.definitionId);
        if (key === "ai_tip_accept_rate_30d") acceptRates.tip = claim.valueNum;
        if (key === "ai_score_accept_rate_30d") acceptRates.score = claim.valueNum;
        if (key === "ai_split_accept_rate_30d") acceptRates.split = claim.valueNum;
      }

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
