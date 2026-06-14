import { normalizeUsage, normalizeUsageRow, type PricingTable, type UsageRow } from "./stats";

export const csvEscape = (value: string) => {
  if (value.includes('"') || value.includes(",") || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
};

const HEADER = [
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
];

export type CsvUsageLog = UsageRow & {
  action: string;
  createdAt: Date;
  user: { name: string | null; email: string | null } | null;
  workspace: { name: string | null } | null;
};

export type CsvLegacyLog = {
  action: string;
  metadata: unknown;
  createdAt: Date;
  actor: { name: string | null; email: string | null } | null;
  targetWorkspace: { name: string | null } | null;
};

/**
 * Render AI usage rows (first-class AiUsage + legacy AI AuditLog entries) as a
 * single CSV string, newest first.
 */
export const buildAiUsageCsv = (params: {
  usageLogs: CsvUsageLog[];
  legacyLogs: CsvLegacyLog[];
  pricingTable: PricingTable;
}): string => {
  const { usageLogs, legacyLogs, pricingTable } = params;
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

  const rows = [
    HEADER,
    ...csvRows
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((item) => item.row),
  ];
  return rows.map((row) => row.map(csvEscape).join(",")).join("\n");
};
