export type OpenAiUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

export type AiUsageMetadata = {
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number | null;
};

const MODEL_PRICING_USD_PER_M = {
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
} as const;

const roundUsd = (value: number) => Math.round(value * 1_000_000) / 1_000_000;

export function buildAiUsageMetadata(
  model: string,
  usage?: OpenAiUsage | null,
): AiUsageMetadata | null {
  if (!usage) return null;
  const promptTokens = Number(usage.prompt_tokens ?? 0);
  const completionTokens = Number(usage.completion_tokens ?? 0);
  const totalTokens = Number(
    usage.total_tokens ?? promptTokens + completionTokens,
  );

  if (![promptTokens, completionTokens, totalTokens].some(Number.isFinite)) {
    return null;
  }

  const pricing = MODEL_PRICING_USD_PER_M[model as keyof typeof MODEL_PRICING_USD_PER_M];
  const costUsd = pricing
    ? roundUsd(
        (promptTokens / 1_000_000) * pricing.input +
          (completionTokens / 1_000_000) * pricing.output,
      )
    : null;

  return {
    model,
    promptTokens,
    completionTokens,
    totalTokens,
    costUsd,
  };
}
