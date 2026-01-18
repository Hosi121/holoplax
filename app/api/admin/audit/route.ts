import { withApiHandler } from "../../../../lib/api-handler";
import { requireAdmin } from "../../../../lib/api-guards";
import { ok } from "../../../../lib/api-response";
import { calculateAiUsageCost, loadAiPricingTable } from "../../../../lib/ai-pricing";
import { createDomainErrors } from "../../../../lib/http/errors";
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
const errors = createDomainErrors("ADMIN");

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

const normalizeUsageRow = (
  row: {
    provider: string;
    model: string;
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
    costUsd: number | null;
    usageSource: string;
  },
  pricingTable: Awaited<ReturnType<typeof loadAiPricingTable>>["table"],
): UsageSummary => {
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

const buildTrendBucketsFromUsage = (
  logs: Array<{
    createdAt: Date;
    provider: string;
    model: string;
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number | null;
    costUsd: number | null;
    usageSource: string;
  }>,
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
    const usage = normalizeUsageRow(log, pricingTable);
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
  return withApiHandler(
    {
      logLabel: "GET /api/admin/audit",
      errorFallback: {
        code: "ADMIN_INTERNAL",
        message: "failed to load audit logs",
        status: 500,
      },
    },
    async () => {
      await requireAdmin("ADMIN");
      const { searchParams } = new URL(request.url);
      const filter = searchParams.get("filter");
      const format = searchParams.get("format");
      const range = resolveRange(searchParams);
      if (!range) {
        return errors.badRequest("invalid range");
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
      if (filter === "ai") {
        const earliestUsage = await prisma.aiUsage.findFirst({
          where: rangeWhere,
          orderBy: { createdAt: "asc" },
          select: { createdAt: true },
        });
        const legacyRangeWhere = earliestUsage
          ? {
              createdAt: {
                gte: range.start,
                lt: earliestUsage.createdAt,
              },
            }
          : rangeWhere;
        if (format === "csv") {
          const usageLogs = await prisma.aiUsage.findMany({
            where: rangeWhere,
            orderBy: { createdAt: "desc" },
            select: {
              action: true,
              provider: true,
              model: true,
              promptTokens: true,
              completionTokens: true,
              totalTokens: true,
              costUsd: true,
              usageSource: true,
              createdAt: true,
              user: { select: { name: true, email: true } },
              workspace: { select: { name: true } },
            },
          });
          const legacyLogs = await prisma.auditLog.findMany({
            where: {
              action: { startsWith: "AI_" },
              ...legacyRangeWhere,
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
          const csvRows: Array<{ createdAt: Date; row: string[] }> = [];
          for (const log of usageLogs) {
            const usage = normalizeUsageRow(log, pricingTable);
            csvRows.push({
              createdAt: log.createdAt,
              row: [
                log.createdAt.toISOString(),
                log.action,
                usage.provider ?? "",
                usage.model ?? "",
                usage.promptTokens?.toString() ?? "",
                usage.completionTokens?.toString() ?? "",
                usage.totalTokens?.toString() ?? "",
                typeof usage.costUsd === "number" ? usage.costUsd.toFixed(6) : "",
                usage.usageSource,
                log.user?.name ?? "",
                log.user?.email ?? "",
                log.workspace?.name ?? "",
              ],
            });
          }
          for (const log of legacyLogs) {
            const usage = normalizeUsage(log.metadata, pricingTable);
            csvRows.push({
              createdAt: log.createdAt,
              row: [
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
              ],
            });
          }
          csvRows
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .forEach((item) => rows.push(item.row));
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

        const usageLogs = await prisma.aiUsage.findMany({
          where: rangeWhere,
          orderBy: { createdAt: "desc" },
          take: limit,
          include: {
            user: { select: { name: true, email: true } },
            workspace: { select: { name: true } },
          },
        });
        const legacyLogs = await prisma.auditLog.findMany({
          where: {
            action: { startsWith: "AI_" },
            ...legacyRangeWhere,
          },
          orderBy: { createdAt: "desc" },
          take: limit,
          include: {
            actor: { select: { id: true, name: true, email: true } },
            targetWorkspace: { select: { id: true, name: true } },
          },
        });
        const mappedUsageLogs = usageLogs.map((log) => ({
          id: log.id,
          action: log.action,
          createdAt: log.createdAt,
          actor: { name: log.user?.name ?? null, email: log.user?.email ?? null },
          targetUser: null,
          targetWorkspace: log.workspace ? { name: log.workspace.name } : null,
          metadata: { taskId: log.taskId, source: log.source },
          usage: normalizeUsageRow(log, pricingTable),
        }));
        const mappedLegacyLogs = legacyLogs.map((log) => ({
          id: log.id,
          action: log.action,
          createdAt: log.createdAt,
          actor: { name: log.actor?.name ?? null, email: log.actor?.email ?? null },
          targetUser: null,
          targetWorkspace: log.targetWorkspace ? { name: log.targetWorkspace.name } : null,
          metadata: log.metadata && typeof log.metadata === "object" ? log.metadata : null,
          usage: normalizeUsage(log.metadata, pricingTable),
        }));
        const mappedLogs = [...mappedUsageLogs, ...mappedLegacyLogs]
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(0, limit);

        const usageRows = await prisma.aiUsage.findMany({
          where: rangeWhere,
          select: {
            provider: true,
            model: true,
            promptTokens: true,
            completionTokens: true,
            totalTokens: true,
            costUsd: true,
            usageSource: true,
            createdAt: true,
            user: { select: { id: true, name: true, email: true } },
            workspace: { select: { id: true, name: true } },
          },
        });
        const legacyUsageLogs = await prisma.auditLog.findMany({
          where: {
            action: { startsWith: "AI_" },
            ...legacyRangeWhere,
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

        for (const log of usageRows) {
          const usage = normalizeUsageRow(log, pricingTable);
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

          const workspaceKey = log.workspace?.id ?? "unknown";
          const workspaceBucket =
            byWorkspace[workspaceKey] ??
            ({
              ...createBucket(),
              name: log.workspace?.name ?? null,
            } as UsageBucket & { name: string | null });
          bumpBucket(workspaceBucket, usage);
          byWorkspace[workspaceKey] = workspaceBucket;

          const userKey = log.user?.id ?? "unknown";
          const userBucket =
            byUser[userKey] ??
            ({
              ...createBucket(),
              name: log.user?.name ?? null,
              email: log.user?.email ?? null,
            } as UsageBucket & { name: string | null; email: string | null });
          bumpBucket(userBucket, usage);
          byUser[userKey] = userBucket;
        }

        const trendRows: Array<{
          createdAt: Date;
          provider: string;
          model: string;
          promptTokens: number | null;
          completionTokens: number | null;
          totalTokens: number | null;
          costUsd: number | null;
          usageSource: string;
        }> = usageRows.map((log) => ({
          createdAt: log.createdAt,
          provider: log.provider,
          model: log.model,
          promptTokens: log.promptTokens,
          completionTokens: log.completionTokens,
          totalTokens: log.totalTokens,
          costUsd: log.costUsd,
          usageSource: log.usageSource,
        }));

        for (const log of legacyUsageLogs) {
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
            weekly: buildTrendBucketsFromUsage(trendRows, pricingTable, "week"),
            monthly: buildTrendBucketsFromUsage(trendRows, pricingTable, "month"),
          },
          pricingSource,
        };

        return ok({ logs: mappedLogs, stats });
      }

      if (format === "csv") {
        return errors.badRequest("csv export is only available for ai filter");
      }

      const logs = await prisma.auditLog.findMany({
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

      return ok({ logs: mappedLogs, stats: null });
    },
  );
}
