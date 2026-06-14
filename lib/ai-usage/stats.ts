import type { loadAiPricingTable } from "../ai-pricing";
import { calculateAiUsageCost } from "../ai-pricing";

export type PricingTable = Awaited<ReturnType<typeof loadAiPricingTable>>["table"];

export type UsageSummary = {
  provider: string | null;
  model: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  costUsd: number | null;
  usageSource: "reported" | "estimated" | "unknown";
  pricingMatched: boolean;
};

export type UsageBucket = {
  totalCostUsd: number;
  totalTokens: number;
  logCount: number;
  unknownUsageCount: number;
  missingPricingCount: number;
};

const toNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

export const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);

export const startOfUtcDay = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));

export const endOfUtcDay = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));

const parseDate = (value: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

export type ResolvedRange = { start: Date; end: Date; label: string; mode: string };

/** Parse the `range`/`start`/`end` query params into a UTC date window. */
export const resolveRange = (searchParams: URLSearchParams): ResolvedRange | null => {
  const mode = (searchParams.get("range") ?? "30d").toLowerCase();
  const now = new Date();
  if (mode === "7d" || mode === "30d" || mode === "90d") {
    const days = Number(mode.replace("d", ""));
    const start = startOfUtcDay(new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000));
    const end = endOfUtcDay(now);
    return { start, end, label: `${toIsoDate(start)} ~ ${toIsoDate(end)}`, mode };
  }
  if (mode === "custom") {
    const startParam = parseDate(searchParams.get("start"));
    const endParam = parseDate(searchParams.get("end"));
    if (!startParam || !endParam) return null;
    const start = startOfUtcDay(startParam);
    const end = endOfUtcDay(endParam);
    if (start > end) return null;
    return { start, end, label: `${toIsoDate(start)} ~ ${toIsoDate(end)}`, mode };
  }
  return null;
};

/** Derive a usage summary from a legacy AuditLog.metadata blob. */
export const normalizeUsage = (metadata: unknown, pricingTable: PricingTable): UsageSummary => {
  const meta =
    metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : null;
  const provider = typeof meta?.provider === "string" ? meta.provider : null;
  const model = typeof meta?.model === "string" ? meta.model : null;
  const promptTokens = toNumber(meta?.promptTokens);
  const completionTokens = toNumber(meta?.completionTokens);
  const rawTotalTokens = toNumber(meta?.totalTokens);
  const hasTokens = promptTokens !== null || completionTokens !== null || rawTotalTokens !== null;
  const totalTokens =
    rawTotalTokens ?? (hasTokens ? (promptTokens ?? 0) + (completionTokens ?? 0) : null);
  const rawSource = typeof meta?.usageSource === "string" ? meta.usageSource : null;
  const usageSource =
    rawSource === "reported" || rawSource === "estimated" || rawSource === "unknown"
      ? rawSource
      : hasTokens
        ? "reported"
        : "unknown";
  const { costUsd, pricingMatched } = calculateAiUsageCost({
    pricingTable,
    provider,
    model,
    promptTokens,
    completionTokens,
  });
  return {
    provider,
    model,
    promptTokens,
    completionTokens,
    totalTokens,
    costUsd,
    usageSource,
    pricingMatched,
  };
};

export type UsageRow = {
  provider: string;
  model: string;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  costUsd: number | null;
  usageSource: string;
};

/** Derive a usage summary from a first-class AiUsage row. */
export const normalizeUsageRow = (row: UsageRow, pricingTable: PricingTable): UsageSummary => {
  const provider = row.provider ?? null;
  const model = row.model ?? null;
  const promptTokens = toNumber(row.promptTokens);
  const completionTokens = toNumber(row.completionTokens);
  const rawTotalTokens = toNumber(row.totalTokens);
  const hasTokens = promptTokens !== null || completionTokens !== null || rawTotalTokens !== null;
  const totalTokens =
    rawTotalTokens ?? (hasTokens ? (promptTokens ?? 0) + (completionTokens ?? 0) : null);
  const usageSource =
    row.usageSource === "reported" ||
    row.usageSource === "estimated" ||
    row.usageSource === "unknown"
      ? row.usageSource
      : hasTokens
        ? "reported"
        : "unknown";
  let costUsd = toNumber(row.costUsd);
  let pricingMatched = false;
  if (provider && model) {
    const pricing = pricingTable[provider]?.[model];
    pricingMatched = Boolean(pricing);
    if (costUsd === null && pricingMatched) {
      const calculated = calculateAiUsageCost({
        pricingTable,
        provider,
        model,
        promptTokens,
        completionTokens,
      });
      costUsd = calculated.costUsd;
    }
  }
  return {
    provider,
    model,
    promptTokens,
    completionTokens,
    totalTokens,
    costUsd,
    usageSource,
    pricingMatched,
  };
};

export const createBucket = (): UsageBucket => ({
  totalCostUsd: 0,
  totalTokens: 0,
  logCount: 0,
  unknownUsageCount: 0,
  missingPricingCount: 0,
});

export const bumpBucket = (bucket: UsageBucket, usage: UsageSummary) => {
  bucket.logCount += 1;
  if (usage.totalTokens === null) {
    bucket.unknownUsageCount += 1;
  } else {
    bucket.totalTokens += usage.totalTokens;
  }
  if (typeof usage.costUsd === "number") {
    bucket.totalCostUsd += usage.costUsd;
  }
  if (!usage.pricingMatched && usage.totalTokens !== null) {
    bucket.missingPricingCount += 1;
  }
};

const getWeekStart = (date: Date) => {
  const utc = startOfUtcDay(date);
  const day = utc.getUTCDay();
  const diff = (day + 6) % 7;
  utc.setUTCDate(utc.getUTCDate() - diff);
  return utc;
};

const getMonthStart = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0));

export type TrendRow = UsageRow & { createdAt: Date };

export const buildTrendBucketsFromUsage = (
  logs: TrendRow[],
  pricingTable: PricingTable,
  interval: "week" | "month",
) => {
  const map = new Map<string, UsageBucket & { start: string; end: string; label: string }>();
  for (const log of logs) {
    const start = interval === "week" ? getWeekStart(log.createdAt) : getMonthStart(log.createdAt);
    const key = interval === "week" ? toIsoDate(start) : start.toISOString().slice(0, 7);
    let bucket = map.get(key);
    if (!bucket) {
      const end =
        interval === "week"
          ? endOfUtcDay(new Date(start.getTime() + 6 * 24 * 60 * 60 * 1000))
          : endOfUtcDay(new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)));
      bucket = {
        ...createBucket(),
        start: start.toISOString(),
        end: end.toISOString(),
        label: interval === "week" ? toIsoDate(start) : start.toISOString().slice(0, 7),
      };
      map.set(key, bucket);
    }
    const usage = normalizeUsageRow(log, pricingTable);
    bumpBucket(bucket, usage);
  }
  return Array.from(map.values()).sort((a, b) => a.start.localeCompare(b.start));
};

type Party = { id?: string | null; name: string | null; email?: string | null } | null;
type Named = { id?: string | null; name: string | null } | null;

export type StatsUsageRow = UsageRow & {
  createdAt: Date;
  user: Party;
  workspace: Named;
};

export type StatsLegacyRow = {
  metadata: unknown;
  createdAt: Date;
  actor: Party;
  targetWorkspace: Named;
};

/**
 * Fold first-class AiUsage rows and legacy AI AuditLog rows into the aggregate
 * stats payload (totals, per-provider/model/workspace/user buckets, and
 * weekly/monthly trends) returned by GET /api/admin/audit?filter=ai.
 */
export const aggregateUsageStats = (params: {
  usageRows: StatsUsageRow[];
  legacyRows: StatsLegacyRow[];
  pricingTable: PricingTable;
  range: ResolvedRange;
  pricingSource: string;
}) => {
  const { usageRows, legacyRows, pricingTable, range, pricingSource } = params;

  const totals = createBucket();
  let promptTokensTotal = 0;
  let completionTokensTotal = 0;
  const byProvider: Record<string, UsageBucket> = {};
  const byModel: Record<string, UsageBucket> = {};
  const byWorkspace: Record<string, UsageBucket & { name: string | null }> = {};
  const byUser: Record<string, UsageBucket & { name: string | null; email: string | null }> = {};
  const trendRows: TrendRow[] = [];

  const accumulate = (
    usage: UsageSummary,
    workspace: { id: string; name: string | null },
    user: { id: string; name: string | null; email: string | null },
  ) => {
    bumpBucket(totals, usage);
    if (usage.promptTokens !== null) promptTokensTotal += usage.promptTokens;
    if (usage.completionTokens !== null) completionTokensTotal += usage.completionTokens;

    const providerKey = usage.provider ?? "unknown";
    const providerBucket = byProvider[providerKey] ?? createBucket();
    bumpBucket(providerBucket, usage);
    byProvider[providerKey] = providerBucket;

    const modelKey = usage.model ?? "unknown";
    const modelBucket = byModel[modelKey] ?? createBucket();
    bumpBucket(modelBucket, usage);
    byModel[modelKey] = modelBucket;

    const workspaceBucket =
      byWorkspace[workspace.id] ??
      ({ ...createBucket(), name: workspace.name } as UsageBucket & {
        name: string | null;
      });
    bumpBucket(workspaceBucket, usage);
    byWorkspace[workspace.id] = workspaceBucket;

    const userBucket =
      byUser[user.id] ??
      ({ ...createBucket(), name: user.name, email: user.email } as UsageBucket & {
        name: string | null;
        email: string | null;
      });
    bumpBucket(userBucket, usage);
    byUser[user.id] = userBucket;
  };

  for (const log of usageRows) {
    const usage = normalizeUsageRow(log, pricingTable);
    accumulate(
      usage,
      { id: log.workspace?.id ?? "unknown", name: log.workspace?.name ?? null },
      {
        id: log.user?.id ?? "unknown",
        name: log.user?.name ?? null,
        email: log.user?.email ?? null,
      },
    );
    trendRows.push({
      createdAt: log.createdAt,
      provider: log.provider,
      model: log.model,
      promptTokens: log.promptTokens,
      completionTokens: log.completionTokens,
      totalTokens: log.totalTokens,
      costUsd: log.costUsd,
      usageSource: log.usageSource,
    });
  }

  for (const log of legacyRows) {
    const usage = normalizeUsage(log.metadata, pricingTable);
    accumulate(
      usage,
      { id: log.targetWorkspace?.id ?? "unknown", name: log.targetWorkspace?.name ?? null },
      {
        id: log.actor?.id ?? "unknown",
        name: log.actor?.name ?? null,
        email: log.actor?.email ?? null,
      },
    );
    trendRows.push({
      createdAt: log.createdAt,
      provider: usage.provider ?? "unknown",
      model: usage.model ?? "unknown",
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
      costUsd: usage.costUsd,
      usageSource: usage.usageSource,
    });
  }

  return {
    range: {
      start: range.start.toISOString(),
      end: range.end.toISOString(),
      label: range.label,
      mode: range.mode,
    },
    totals: {
      totalCostUsd: totals.totalCostUsd,
      promptTokens: promptTokensTotal,
      completionTokens: completionTokensTotal,
      totalTokens: totals.totalTokens,
      logCount: totals.logCount,
      unknownUsageCount: totals.unknownUsageCount,
      missingPricingCount: totals.missingPricingCount,
    },
    byProvider,
    byModel,
    byWorkspace,
    byUser,
    trends: {
      weekly: buildTrendBucketsFromUsage(trendRows, pricingTable, "week"),
      monthly: buildTrendBucketsFromUsage(trendRows, pricingTable, "month"),
    },
    pricingSource,
  };
};
