import { loadAiPricingTable } from "../../../../lib/ai-pricing";
import { buildAiUsageCsv } from "../../../../lib/ai-usage/csv";
import {
  aggregateUsageStats,
  normalizeUsage,
  normalizeUsageRow,
  resolveRange,
} from "../../../../lib/ai-usage/stats";
import { requireAdmin } from "../../../../lib/api-guards";
import { withApiHandler } from "../../../../lib/api-handler";
import { ok } from "../../../../lib/api-response";
import { createDomainErrors } from "../../../../lib/http/errors";
import prisma from "../../../../lib/prisma";

const errors = createDomainErrors("ADMIN");

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
      const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? 200), 1), 500);
      const { table: pricingTable, source: pricingSource } = await loadAiPricingTable();
      const rangeWhere = {
        createdAt: {
          gte: range.start,
          lte: range.end,
        },
      };
      if (filter === "ai") {
        // AiUsage superseded AI_* AuditLog rows at a cutover point; only read
        // legacy rows older than the first AiUsage row so the two never overlap.
        const earliestUsage = await prisma.aiUsage.findFirst({
          where: rangeWhere,
          orderBy: { createdAt: "asc" },
          select: { createdAt: true },
        });
        const legacyRangeWhere = earliestUsage
          ? { createdAt: { gte: range.start, lt: earliestUsage.createdAt } }
          : rangeWhere;

        if (format === "csv") {
          // CSV export capped at 10 000 rows each to prevent unbounded
          // memory allocation for wide custom date ranges.
          const CSV_EXPORT_LIMIT = 10_000;
          const usageLogs = await prisma.aiUsage.findMany({
            where: rangeWhere,
            orderBy: { createdAt: "desc" },
            take: CSV_EXPORT_LIMIT,
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
            where: { action: { startsWith: "AI_" }, ...legacyRangeWhere },
            orderBy: { createdAt: "desc" },
            take: CSV_EXPORT_LIMIT,
            select: {
              action: true,
              metadata: true,
              createdAt: true,
              actor: { select: { name: true, email: true } },
              targetWorkspace: { select: { name: true } },
            },
          });
          const csv = buildAiUsageCsv({ usageLogs, legacyLogs, pricingTable });
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
          where: { action: { startsWith: "AI_" }, ...legacyRangeWhere },
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

        // Cap aggregation scans so a wide custom range can't load an unbounded
        // number of rows into memory on a busy instance.
        const STATS_ROW_CAP = 50_000;
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
          orderBy: { createdAt: "desc" },
          take: STATS_ROW_CAP,
        });
        const legacyUsageLogs = await prisma.auditLog.findMany({
          where: { action: { startsWith: "AI_" }, ...legacyRangeWhere },
          select: {
            metadata: true,
            createdAt: true,
            actor: { select: { id: true, name: true, email: true } },
            targetWorkspace: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: "desc" },
          take: STATS_ROW_CAP,
        });

        const stats = aggregateUsageStats({
          usageRows,
          legacyRows: legacyUsageLogs,
          pricingTable,
          range,
          pricingSource,
        });

        return ok({ logs: mappedLogs, stats });
      }

      if (format === "csv") {
        return errors.badRequest("csv export is only available for ai filter");
      }

      const logs = await prisma.auditLog.findMany({
        where: rangeWhere,
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
