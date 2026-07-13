import { loadAiPricingTable } from "../../../lib/ai-pricing";
import { buildAiUsageCsv } from "../../../lib/ai-usage/csv";
import {
  aggregateUsageStats,
  normalizeUsage,
  normalizeUsageRow,
} from "../../../lib/ai-usage/stats";
import prisma from "../../../lib/prisma";
import { ApplicationError } from "../../shared/application/application-error";
import type { AdminOperationsPort } from "../application/admin-operations";

export const getAdminAudit: AdminOperationsPort["getAudit"] = async (input) => {
  const { table: pricingTable, source: pricingSource } = await loadAiPricingTable();
  const rangeWhere = { createdAt: { gte: input.range.start, lte: input.range.end } };

  if (input.filter === "ai") {
    const earliestUsage = await prisma.aiUsage.findFirst({
      where: rangeWhere,
      orderBy: { createdAt: "asc" },
      select: { createdAt: true },
    });
    const legacyRangeWhere = earliestUsage
      ? { createdAt: { gte: input.range.start, lt: earliestUsage.createdAt } }
      : rangeWhere;

    if (input.format === "csv") {
      const [usageLogs, legacyLogs] = await Promise.all([
        prisma.aiUsage.findMany({
          where: rangeWhere,
          orderBy: { createdAt: "desc" },
          take: 10_000,
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
        }),
        prisma.auditLog.findMany({
          where: { action: { startsWith: "AI_" }, ...legacyRangeWhere },
          orderBy: { createdAt: "desc" },
          take: 10_000,
          select: {
            action: true,
            metadata: true,
            createdAt: true,
            actor: { select: { name: true, email: true } },
            targetWorkspace: { select: { name: true } },
          },
        }),
      ]);
      return {
        kind: "csv",
        csv: buildAiUsageCsv({ usageLogs, legacyLogs, pricingTable }),
        fileLabel: input.range.label,
      };
    }

    const [usageLogs, legacyLogs, usageRows, legacyUsageLogs] = await Promise.all([
      prisma.aiUsage.findMany({
        where: rangeWhere,
        orderBy: { createdAt: "desc" },
        take: input.limit,
        include: {
          user: { select: { name: true, email: true } },
          workspace: { select: { name: true } },
        },
      }),
      prisma.auditLog.findMany({
        where: { action: { startsWith: "AI_" }, ...legacyRangeWhere },
        orderBy: { createdAt: "desc" },
        take: input.limit,
        include: {
          actor: { select: { id: true, name: true, email: true } },
          targetWorkspace: { select: { id: true, name: true } },
        },
      }),
      prisma.aiUsage.findMany({
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
        take: 50_000,
      }),
      prisma.auditLog.findMany({
        where: { action: { startsWith: "AI_" }, ...legacyRangeWhere },
        select: {
          metadata: true,
          createdAt: true,
          actor: { select: { id: true, name: true, email: true } },
          targetWorkspace: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 50_000,
      }),
    ]);
    const mappedUsage = usageLogs.map((log) => ({
      id: log.id,
      action: log.action,
      createdAt: log.createdAt,
      actor: { name: log.user?.name ?? null, email: log.user?.email ?? null },
      targetUser: null,
      targetWorkspace: log.workspace ? { name: log.workspace.name } : null,
      metadata: { taskId: log.taskId, source: log.feature },
      usage: normalizeUsageRow(log, pricingTable),
    }));
    const mappedLegacy = legacyLogs.map((log) => ({
      id: log.id,
      action: log.action,
      createdAt: log.createdAt,
      actor: { name: log.actor?.name ?? null, email: log.actor?.email ?? null },
      targetUser: null,
      targetWorkspace: log.targetWorkspace ? { name: log.targetWorkspace.name } : null,
      metadata: log.metadata && typeof log.metadata === "object" ? log.metadata : null,
      usage: normalizeUsage(log.metadata, pricingTable),
    }));
    return {
      kind: "json",
      logs: [...mappedUsage, ...mappedLegacy]
        .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
        .slice(0, input.limit),
      stats: aggregateUsageStats({
        usageRows,
        legacyRows: legacyUsageLogs,
        pricingTable,
        range: input.range,
        pricingSource,
      }),
    };
  }

  if (input.format === "csv") {
    throw new ApplicationError(
      "ADMIN_BAD_REQUEST",
      "csv export is only available for ai filter",
      "bad_request",
    );
  }
  const logs = await prisma.auditLog.findMany({
    where: rangeWhere,
    orderBy: { createdAt: "desc" },
    take: input.limit,
    include: {
      actor: { select: { name: true, email: true } },
      targetUser: { select: { name: true, email: true } },
      targetWorkspace: { select: { name: true } },
    },
  });
  return {
    kind: "json",
    logs: logs.map((log) => ({
      ...log,
      usage: log.action.startsWith("AI_") ? normalizeUsage(log.metadata, pricingTable) : null,
    })),
    stats: null,
  };
};
