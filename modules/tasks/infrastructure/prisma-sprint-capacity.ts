import type { Prisma } from "@prisma/client";

// Accepts either the root PrismaClient or a transaction client, so callers can
// run the capacity check inside the same serializable transaction as their
// writes or standalone command execution.
type SprintDb = Prisma.TransactionClient;

export type ActiveSprint = { id: string; capacityPoints: number };

/** The most recently started ACTIVE sprint for a workspace, or null. */
export function findActiveSprint(
  client: SprintDb,
  workspaceId: string,
): Promise<ActiveSprint | null> {
  return client.sprint.findFirst({
    where: { workspaceId, status: "ACTIVE" },
    orderBy: { startedAt: "desc" },
    select: { id: true, capacityPoints: true },
  });
}

/**
 * Sum of immutable story-point snapshots currently occupying sprint capacity.
 * Completed work still occupies the sprint commitment; removed/carry-over work
 * does not. `taskKey` survives task deletion, so history stays attributable.
 */
export async function sumSprintPoints(
  client: SprintDb,
  sprintId: string,
  excludeTaskIds: string[] = [],
): Promise<number> {
  const agg = await client.sprintItem.aggregate({
    where: {
      sprintId,
      removedAt: null,
      outcome: { in: ["COMMITTED", "COMPLETED"] },
      ...(excludeTaskIds.length ? { taskKey: { notIn: excludeTaskIds } } : {}),
    },
    _sum: { committedPoints: true },
  });
  return agg._sum.committedPoints ?? 0;
}

export type CapacityCheck = {
  activeSprint: ActiveSprint | null;
  committedPoints: number;
  nextTotal: number;
  exceeded: boolean;
};

/**
 * Decide whether adding `additionalPoints` to the active sprint would exceed
 * its capacity. When there is no active sprint the check is a no-op
 * (`exceeded: false`); callers that require an active sprint should inspect
 * `activeSprint` themselves. Pass a pre-fetched `activeSprint` to reuse a
 * lookup the caller already performed.
 */
export async function checkSprintCapacity(
  client: SprintDb,
  params: {
    workspaceId: string;
    additionalPoints: number;
    excludeTaskIds?: string[];
    activeSprint?: ActiveSprint | null;
  },
): Promise<CapacityCheck> {
  const activeSprint =
    params.activeSprint !== undefined
      ? params.activeSprint
      : await findActiveSprint(client, params.workspaceId);
  if (!activeSprint) {
    return { activeSprint: null, committedPoints: 0, nextTotal: 0, exceeded: false };
  }
  const committedPoints = await sumSprintPoints(
    client,
    activeSprint.id,
    params.excludeTaskIds ?? [],
  );
  const nextTotal = committedPoints + params.additionalPoints;
  return {
    activeSprint,
    committedPoints,
    nextTotal,
    exceeded: nextTotal > activeSprint.capacityPoints,
  };
}
