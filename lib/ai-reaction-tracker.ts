/**
 * AI提案の反応トラッキングユーティリティ
 */

export type SuggestionContext = {
  taskType?: string;
  taskPoints?: number;
  hourOfDay?: number;
  dayOfWeek?: number;
  wipCount?: number;
  flowState?: number;
};

type ReactionType = "VIEWED" | "ACCEPTED" | "MODIFIED" | "REJECTED" | "IGNORED";

type ReactionPayload = {
  suggestionId: string;
  reaction: ReactionType;
  context?: SuggestionContext;
  modification?: Record<string, unknown>;
  viewedAt?: string;
  reactedAt?: string;
};

/**
 * 提案が表示されたことを記録する
 */
export function trackSuggestionViewed(
  suggestionId: string | null | undefined,
  context?: SuggestionContext,
): string | null {
  if (!suggestionId) return null;
  const viewedAt = new Date().toISOString();
  sendReaction({
    suggestionId,
    reaction: "VIEWED",
    context: {
      ...context,
      hourOfDay: new Date().getHours(),
      dayOfWeek: new Date().getDay(),
    },
    viewedAt,
  });
  return viewedAt;
}

/**
 * 提案がそのまま適用されたことを記録する
 */
export function trackSuggestionAccepted(
  suggestionId: string | null | undefined,
  viewedAt?: string | null,
): void {
  if (!suggestionId) return;
  sendReaction({
    suggestionId,
    reaction: "ACCEPTED",
    viewedAt: viewedAt ?? undefined,
    reactedAt: new Date().toISOString(),
  });
}

/**
 * 提案が明示的に却下されたことを記録する
 */
export function trackSuggestionRejected(
  suggestionId: string | null | undefined,
  viewedAt?: string | null,
): void {
  if (!suggestionId) return;
  sendReaction({
    suggestionId,
    reaction: "REJECTED",
    viewedAt: viewedAt ?? undefined,
    reactedAt: new Date().toISOString(),
  });
}

function sendReaction(payload: ReactionPayload): void {
  fetch("/api/ai/reaction", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).catch((error) => {
    // 反応トラッキングの失敗はサイレントに無視
    console.error("Failed to track suggestion reaction:", error);
  });
}
