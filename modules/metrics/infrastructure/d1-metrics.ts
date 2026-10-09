import type { DatabaseClient } from "../../../database/client";
import type { MemoryScope } from "../../../database/models";
import defaultDatabase from "../../../lib/db";
import {
  alphaForDecay,
  computeFlowState,
  computeMetrics,
  type MetricTask,
  median,
} from "../domain/metrics";

const DAY = 86_400_000;
const core = [
  ["throughput_14d", "NUMBER", 14],
  ["lead_time_median_30d", "DURATION_MS", 30],
  ["deadline_adherence_30d", "RATIO", 30],
  ["wip_avg_14d", "NUMBER", 14],
] as const;
const userMetrics = [
  "ai_score_accept_rate_30d",
  "ai_split_accept_rate_30d",
  "ai_tip_accept_rate_30d",
  "ai_score_modify_rate_30d",
  "ai_split_modify_rate_30d",
  "ai_reaction_latency_p50_30d",
];
const ownerColumn = (scope: MemoryScope) =>
  scope === "WORKSPACE" ? "workspaceId" : "taskCreatorId";
async function loadTasks(
  db: DatabaseClient,
  scope: MemoryScope,
  ownerId: string,
): Promise<MetricTask[]> {
  // Only a fixed enum controls this identifier. Owner data remains bound.
  const owner = ownerColumn(scope);
  return db.query<MetricTask>(
    `
    WITH scoped AS (
      SELECT "taskKey", "toState", "taskCreatedAt", "taskDueDate", "createdAt", "id"
      FROM "TaskWorkflowEvent" WHERE "${owner}" = ?
    ), latest AS (
      SELECT "taskKey", "toState", "taskCreatedAt", "createdAt",
        ROW_NUMBER() OVER (PARTITION BY "taskKey" ORDER BY "createdAt" DESC, "id" DESC) AS rank
      FROM scoped
    ), latest_done AS (
      SELECT "taskKey", "taskDueDate", "createdAt",
        ROW_NUMBER() OVER (PARTITION BY "taskKey" ORDER BY "createdAt" DESC, "id" DESC) AS rank
      FROM scoped WHERE "toState" = 'DONE'
    )
    SELECT COALESCE(l."taskCreatedAt", l."createdAt") AS "createdAt", l."toState" AS "workflowState",
      d."taskDueDate" AS "dueDate", d."createdAt" AS "doneAt"
    FROM latest l LEFT JOIN latest_done d ON d."taskKey" = l."taskKey" AND d.rank = 1 WHERE l.rank = 1
  `,
    [ownerId],
  );
}
async function averageWip(db: DatabaseClient, scope: MemoryScope, ownerId: string, now: number) {
  const start = now - 14 * DAY;
  const rows = await db.query<{ value: number }>(
    `
    WITH ordered AS (
      SELECT "toState", "createdAt" AS start_at,
        LEAD("createdAt") OVER (PARTITION BY "taskKey" ORDER BY "createdAt", "id") AS end_at
      FROM "TaskWorkflowEvent" WHERE "${ownerColumn(scope)}" = ? AND "createdAt" < ?
    )
    SELECT COALESCE(SUM(MAX(0, MIN(COALESCE(end_at, ?), ?) - MAX(start_at, ?))) / ?, 0) AS value
    FROM ordered WHERE "toState" IN ('IN_PROGRESS','BLOCKED') AND COALESCE(end_at, ?) > ?
  `,
    [ownerId, now, now, now, start, 14 * DAY, now, start],
  );
  return rows[0]?.value ?? 0;
}
async function suggestionMetrics(db: DatabaseClient, userId: string, now: number) {
  const [counts, latencies] = await Promise.all([
    db.query<{ type: string; reaction: string; count: number }>(
      `SELECT s."type", r."reaction", COUNT(*) AS count FROM "AiSuggestionReaction" r JOIN "AiSuggestion" s ON s.id = r."suggestionId" WHERE r."userId" = ? AND r."createdAt" >= ? GROUP BY s."type", r."reaction"`,
      [userId, now - 30 * DAY],
    ),
    db.aiSuggestionReaction.findMany({
      where: { userId, createdAt: { gte: new Date(now - 30 * DAY) }, latencyMs: { not: null } },
      select: { latencyMs: true },
    }),
  ]);
  const byType = new Map<string, Record<string, number>>();
  for (const row of counts) {
    const group = byType.get(row.type) ?? {};
    group[row.reaction] = row.count;
    byType.set(row.type, group);
  }
  const values: Record<string, number | null> = {};
  for (const [type, count] of byType) {
    const applied = (count.ACCEPTED ?? 0) + (count.MODIFIED ?? 0);
    if (count.VIEWED > 0)
      values[`ai_${type.toLowerCase()}_accept_rate_30d`] = applied / count.VIEWED;
    if (applied > 0)
      values[`ai_${type.toLowerCase()}_modify_rate_30d`] = (count.MODIFIED ?? 0) / applied;
  }
  if (latencies.length)
    values.ai_reaction_latency_p50_30d = median(latencies.map((row) => row.latencyMs!));
  return values;
}
async function aiTrust(db: DatabaseClient, workspaceId: string, now: number) {
  const cutoff = new Date(now - 30 * DAY);
  const [suggestions, preps, applies, prepApplies] = await Promise.all([
    db.aiSuggestion.count({ where: { workspaceId, createdAt: { gte: cutoff } } }),
    db.aiPrepOutput.count({ where: { workspaceId, createdAt: { gte: cutoff } } }),
    db.auditLog.count({
      where: { targetWorkspaceId: workspaceId, createdAt: { gte: cutoff }, action: "AI_APPLY" },
    }),
    db.aiPrepOutput.count({
      where: { workspaceId, updatedAt: { gte: cutoff }, status: "APPLIED" },
    }),
  ]);
  return suggestions + preps > 0
    ? Math.min(1, (applies + prepApplies) / (suggestions + preps))
    : null;
}
export async function runMetricScope(
  scope: MemoryScope,
  ownerId: string,
  now: number,
  db: DatabaseClient = defaultDatabase,
) {
  const owner = scope === "WORKSPACE" ? { workspaceId: ownerId } : { userId: ownerId };
  const exists =
    scope === "WORKSPACE"
      ? await db.workspace.findUnique({ where: { id: ownerId }, select: { id: true } })
      : await db.user.findUnique({ where: { id: ownerId }, select: { id: true } });
  if (!exists) return;
  const [tasks, wip] = await Promise.all([
    loadTasks(db, scope, ownerId),
    averageWip(db, scope, ownerId, now),
  ]);
  const [, lead, adherence] = computeMetrics(tasks, 30, now);
  const [throughput] = computeMetrics(tasks, 14, now);
  const values: Record<string, number | null> = {
    throughput_14d: throughput,
    lead_time_median_30d: lead,
    deadline_adherence_30d: adherence,
    wip_avg_14d: wip,
  };
  if (scope === "WORKSPACE") {
    values.flow_state = computeFlowState(lead, wip, throughput);
    values.ai_trust_state = await aiTrust(db, ownerId, now);
  } else Object.assign(values, await suggestionMetrics(db, ownerId, now));
  const windowEnd = new Date(Math.floor(now / DAY) * DAY),
    windowStart = new Date(windowEnd.getTime() - DAY);
  await db.command(async (tx) => {
    const specs = [
      ...core,
      ...(scope === "WORKSPACE"
        ? ([
            ["flow_state", "NUMBER", 30],
            ["ai_trust_state", "NUMBER", 30],
          ] as const)
        : userMetrics.map(
            (key) => [key, key.includes("latency") ? "DURATION_MS" : "RATIO", 30] as const,
          )),
    ];
    for (const [key, valueType, days] of specs) {
      const definition = await tx.memoryDefinition.upsert({
        where: { key_scope: { key, scope } },
        update: {},
        create: {
          key,
          scope,
          valueType,
          granularity: "daily",
          updatePolicy: "derived",
          decayDays: days,
        },
      });
      const value = values[key];
      if (value == null) continue;
      const existing = await tx.memoryMetric.findFirst({
        where: { definitionId: definition.id, ...owner, windowStart, windowEnd },
      });
      // Queue deliveries can repeat. A daily sample must contribute to EMA only once.
      if (existing) continue;
      await tx.memoryMetric.create({
        data: {
          definitionId: definition.id,
          ...owner,
          windowStart,
          windowEnd,
          valueNum: value,
          computedAt: new Date(now),
        },
      });
      const claim = await tx.memoryClaim.findFirst({
        where: { definitionId: definition.id, ...owner, status: "ACTIVE" },
      });
      if (claim?.provenance === "EXPLICIT") continue;
      if (claim) {
        const alpha = alphaForDecay(definition.decayDays ?? 30);
        await tx.memoryClaim.update({
          where: { id: claim.id },
          data: { valueNum: alpha * value + (1 - alpha) * (claim.valueNum ?? 0) },
        });
      } else
        await tx.memoryClaim.create({
          data: {
            definitionId: definition.id,
            ...owner,
            valueNum: value,
            provenance: "INFERRED",
            status: "ACTIVE",
          },
        });
    }
  });
}
