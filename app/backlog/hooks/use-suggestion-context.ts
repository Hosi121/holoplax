import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";

type SuggestionType = "TIP" | "SCORE" | "SPLIT";

type Recommendation = {
  type: SuggestionType;
  reason: string;
  confidence: number;
};

export type AiContext = {
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

const REFRESH_INTERVAL_MS = 60_000; // 60秒ごとに更新

export function useSuggestionContext() {
  const [context, setContext] = useState<AiContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchContext = useCallback(async () => {
    try {
      const res = await apiFetch("/api/ai/context");
      if (res.ok) {
        const data = await res.json();
        setContext(data);
        setError(null);
      } else {
        setError("Failed to fetch AI context");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchContext();
    const interval = setInterval(fetchContext, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchContext]);

  // 受容率が閾値を超えているかチェック
  const shouldShowSuggestion = useCallback(
    (type: SuggestionType, threshold = 0.3): boolean => {
      if (!context) return true; // データがない場合はデフォルトで表示

      // WIPが多すぎる場合は抑制
      if (context.wipCount > 5) return false;

      const rate = context.acceptRates[type.toLowerCase() as keyof typeof context.acceptRates];
      // 受容率データがない場合は表示、ある場合は閾値チェック
      return rate === null || rate >= threshold;
    },
    [context],
  );

  // 特定タイプの受容率を取得
  const getAcceptRate = useCallback(
    (type: SuggestionType): number | null => {
      if (!context) return null;
      return context.acceptRates[type.toLowerCase() as keyof typeof context.acceptRates];
    },
    [context],
  );

  return {
    context,
    loading,
    error,
    refetch: fetchContext,
    shouldShowSuggestion,
    getAcceptRate,
  };
}
