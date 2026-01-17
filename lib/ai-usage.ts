export type OpenAiUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

export type AiUsageMetadata = {
  provider: string;
  model: string;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  costUsd: number | null;
  usageSource: "reported" | "estimated" | "unknown";
};

const toNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

export function buildAiUsageMetadata(
  provider: string,
  model: string,
  usage?: OpenAiUsage | null,
): AiUsageMetadata | null {
  if (!provider || !model) return null;
  if (!usage) {
    return {
      provider,
      model,
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
      costUsd: null,
      usageSource: "unknown",
    };
  }

  const promptTokens = toNumber(usage.prompt_tokens);
  const completionTokens = toNumber(usage.completion_tokens);
  const rawTotalTokens = toNumber(usage.total_tokens);
  const hasTokens = promptTokens !== null || completionTokens !== null || rawTotalTokens !== null;
  const totalTokens = rawTotalTokens ?? (hasTokens ? (promptTokens ?? 0) + (completionTokens ?? 0) : null);

  return {
    provider,
    model,
    promptTokens,
    completionTokens,
    totalTokens,
    costUsd: null,
    usageSource: hasTokens ? "reported" : "unknown",
  };
}
