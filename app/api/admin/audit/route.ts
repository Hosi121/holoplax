import { requireAuth } from "../../../../lib/api-auth";
import {
  badRequest,
  forbidden,
  handleAuthError,
  ok,
  serverError,
} from "../../../../lib/api-response";
import { calculateAiUsageCost, loadAiPricingTable } from "../../../../lib/ai-pricing";
import prisma from "../../../../lib/prisma";

type UsageSummary = {
  provider: string | null;
  model: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  costUsd: number | null;
  usageSource: "reported" | "estimated" | "unknown";
  pricingMatched: boolean;
};

type UsageBucket = {
  totalCostUsd: number;
  totalTokens: number;
  logCount: number;
  unknownUsageCount: number;
  missingPricingCount: number;
};

const toNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const toIsoDate = (date: Date) => date.toISOString().slice(0, 10);

const startOfUtcDay = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));

const endOfUtcDay = (date: Date) =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 23, 59, 59, 999));

const parseDate = (value: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const resolveRange = (searchParams: URLSearchParams) => {
  const mode = (searchParams.get("range") ?? "30d").toLowerCase();
  const now = new Date();
  if (mode === "7d" || mode === "30d" || mode === "90d") {
    const days = Number(mode.replace("d", ""));
    const start = startOfUtcDay(
      new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000),
    );
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

const normalizeUsage = (
  metadata: unknown,
  pricingTable: Awaited<ReturnType<typeof loadAiPricingTable>>["table"],
): UsageSummary => {
  const meta =
    metadata && typeof metadata === "object"
      ? (metadata as Record<string, unknown>)
      : null;
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

const createBucket = (): UsageBucket => ({
  totalCostUsd: 0,
  totalTokens: 0,
  logCount: 0,
  unknownUsageCount: 0,
  missingPricingCount: 0,
});

const bumpBucket = (bucket: UsageBucket, usage: UsageSummary) => {
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

const buildTrendBuckets = (
  logs: Array<{ createdAt: Date; metadata: unknown }>,
  pricingTable: Awaited<ReturnType<typeof loadAiPricingTable>>["table"],
  interval: "week" | "month",
) => {
  const map = new Map<string, UsageBucket & { start: string; end: string; label: string }>();
  for (const log of logs) {
    const start =
      interval === "week" ? getWeekStart(log.createdAt) : getMonthStart(log.createdAt);
    const key =
      interval === "week" ? toIsoDate(start) : start.toISOString().slice(0, 7);
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
    const usage = normalizeUsage(log.metadata, pricingTable);
    bumpBucket(bucket, usage);
  }
  return Array.from(map.values()).sort((a, b) => a.start.localeCompare(b.start));
};

const csvEscape = (value: string) => {
  if (value.includes('"') || value.includes(",") || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
};

export async function GET(request: Request) {
  try {
    const { role } = await requireAuth();
    if (role !== "ADMIN") {
      return forbidden();
    }
    const { searchParams } = new URL(request.url);
    const filter = searchParams.get("filter");
    const format = searchParams.get("format");
    const range = resolveRange(searchParams);
    if (!range) {
      return badRequest("invalid range");
    }
    const limit = Math.min(
      Math.max(Number(searchParams.get("limit") ?? 200), 1),
      500,
    );
    const { table: pricingTable, source: pricingSource } = await loadAiPricingTable();
    const rangeWhere = {
      createdAt: {
        gte: range.start,
        lte: range.end,
      },
    };
    const where =
      filter === "ai"
        ? {
            action: { startsWith: "AI_" },
            ...rangeWhere,
          }
        : {};

    if (format === "csv") {
      if (filter !== "ai") {
        return badRequest("csv export is only available for ai filter");
      }
      const usageLogs = await prisma.auditLog.findMany({
        where: {
          action: { startsWith: "AI_" },
          ...rangeWhere,
        },
        orderBy: { createdAt: "desc" },
        select: {
          action: true,
          metadata: true,
          createdAt: true,
          actor: { select: { name: true, email: true } },
          targetWorkspace: { select: { name: true } },
        },
      });
      const rows = [
        [
          "createdAt",
          "action",
          "provider",
          "model",
          "promptTokens",
          "completionTokens",
          "totalTokens",
          "costUsd",
          "usageSource",
          "actorName",
          "actorEmail",
          "workspaceName",
        ],
      ];
      for (const log of usageLogs) {
        const usage = normalizeUsage(log.metadata, pricingTable);
        rows.push([
          log.createdAt.toISOString(),
          log.action,
          usage.provider ?? "",
          usage.model ?? "",
          usage.promptTokens?.toString() ?? "",
          usage.completionTokens?.toString() ?? "",
          usage.totalTokens?.toString() ?? "",
          typeof usage.costUsd === "number" ? usage.costUsd.toFixed(6) : "",
          usage.usageSource,
          log.actor?.name ?? "",
          log.actor?.email ?? "",
          log.targetWorkspace?.name ?? "",
        ]);
      }
      const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
      return new Response(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="ai-usage-${range.label.replace(
            /[^0-9-]/g,
            "_",
          )}.csv"`,
        },
      });
    }

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: {
        actor: { select: { name: true, email: true } },
        targetUser: { select: { name: true, email: true } },
        targetWorkspace: { select: { name: true } },
      },
    });
    const mappedLogs = logs.map((log) => {
      const usage = log.action.startsWith("AI_")
        ? normalizeUsage(log.metadata, pricingTable)
        : null;
      return { ...log, usage };
    });

    if (filter !== "ai") {
      return ok({ logs: mappedLogs, stats: null });
    }

    const usageLogs = await prisma.auditLog.findMany({
      where: {
        action: { startsWith: "AI_" },
        ...rangeWhere,
      },
      select: {
        metadata: true,
        createdAt: true,
        actor: { select: { id: true, name: true, email: true } },
        targetWorkspace: { select: { id: true, name: true } },
      },
    });

    const totals = createBucket();
    let promptTokensTotal = 0;
    let completionTokensTotal = 0;
    const byProvider: Record<string, UsageBucket> = {};
    const byModel: Record<string, UsageBucket> = {};
    const byWorkspace: Record<string, UsageBucket & { name: string | null }> = {};
    const byUser: Record<string, UsageBucket & { name: string | null; email: string | null }> = {};

    for (const log of usageLogs) {
      const usage = normalizeUsage(log.metadata, pricingTable);
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

      const workspaceKey = log.targetWorkspace?.id ?? "unknown";
      const workspaceBucket =
        byWorkspace[workspaceKey] ??
        ({
          ...createBucket(),
          name: log.targetWorkspace?.name ?? null,
        } as UsageBucket & { name: string | null });
      bumpBucket(workspaceBucket, usage);
      byWorkspace[workspaceKey] = workspaceBucket;

      const userKey = log.actor?.id ?? "unknown";
      const userBucket =
        byUser[userKey] ??
        ({
          ...createBucket(),
          name: log.actor?.name ?? null,
          email: log.actor?.email ?? null,
        } as UsageBucket & { name: string | null; email: string | null });
      bumpBucket(userBucket, usage);
      byUser[userKey] = userBucket;
    }

    const stats = {
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
        weekly: buildTrendBuckets(usageLogs, pricingTable, "week"),
        monthly: buildTrendBuckets(usageLogs, pricingTable, "month"),
      },
      pricingSource,
    };

    return ok({ logs: mappedLogs, stats });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    console.error("GET /api/admin/audit error", error);
    return serverError("failed to load audit logs");
  }
}
