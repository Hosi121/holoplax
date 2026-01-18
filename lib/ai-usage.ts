import { calculateAiUsageCost, loadAiPricingTable } from "./ai-pricing";
import prisma from "./prisma";

export type OpenAiUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
};

export type AiUsageContext = {
  action: string;
  userId?: string | null;
  workspaceId?: string | null;
  taskId?: string | null;
  source?: string | null;
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

const PRICING_CACHE_TTL_MS = 60_000;
let pricingCache: {
  table: Awaited<ReturnType<typeof loadAiPricingTable>>["table"];
  source: Awaited<ReturnType<typeof loadAiPricingTable>>["source"];
  expiresAt: number;
} | null = null;

const loadPricingTableCached = async () => {
  const now = Date.now();
  if (pricingCache && pricingCache.expiresAt > now) {
    return pricingCache;
  }
  const fresh = await loadAiPricingTable();
  pricingCache = { ...fresh, expiresAt: now + PRICING_CACHE_TTL_MS };
  return pricingCache;
};

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

export async function recordAiUsage(params: {
  provider: string;
  model: string;
  usage?: OpenAiUsage | null;
  context: AiUsageContext;
}): Promise<void> {
  const usageMeta = buildAiUsageMetadata(params.provider, params.model, params.usage);
  if (!usageMeta) return;

  try {
    const { table } = await loadPricingTableCached();
    const { costUsd } = calculateAiUsageCost({
      pricingTable: table,
      provider: usageMeta.provider,
      model: usageMeta.model,
      promptTokens: usageMeta.promptTokens,
      completionTokens: usageMeta.completionTokens,
    });

    await prisma.aiUsage.create({
      data: {
        action: params.context.action,
        provider: usageMeta.provider,
        model: usageMeta.model,
        promptTokens: usageMeta.promptTokens ?? undefined,
        completionTokens: usageMeta.completionTokens ?? undefined,
        totalTokens: usageMeta.totalTokens ?? undefined,
        costUsd: costUsd ?? undefined,
        usageSource: usageMeta.usageSource,
        source: params.context.source ?? null,
        taskId: params.context.taskId ?? null,
        userId: params.context.userId ?? null,
        workspaceId: params.context.workspaceId ?? null,
      },
    });
  } catch {
    // Usage logging should not block core flows.
  }
}
