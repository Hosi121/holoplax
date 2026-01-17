export type OpenAiUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

export type AiUsageMetadata = {
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number | null;
};

const PRICING_USD_PER_M = {
  OPENAI: {
    "gpt-4o-mini": { input: 0.15, output: 0.6 },
    "gpt-4o": { input: 5, output: 15 },
  },
  ANTHROPIC: {
    "claude-3-5-sonnet-20240620": { input: 3, output: 15 },
    "claude-3-5-haiku-20241022": { input: 0.8, output: 4 },
  },
} as const;

const roundUsd = (value: number) => Math.round(value * 1_000_000) / 1_000_000;

export function buildAiUsageMetadata(
  provider: string,
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

  const pricingTable = (PRICING_USD_PER_M as Record<string, Record<string, { input: number; output: number }>>)[provider];
  const pricing = pricingTable ? pricingTable[model] : undefined;
  const costUsd = pricing
    ? roundUsd(
        (promptTokens / 1_000_000) * pricing.input +
          (completionTokens / 1_000_000) * pricing.output,
      )
    : null;

  return {
    provider,
    model,
    promptTokens,
    completionTokens,
    totalTokens,
    costUsd,
  };
}
