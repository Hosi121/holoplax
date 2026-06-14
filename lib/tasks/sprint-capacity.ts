import type { Prisma } from "@prisma/client";
import { TASK_STATUS } from "../types";

// Accepts either the root PrismaClient or a transaction client, so callers can
// run the capacity check inside the same serializable transaction as their
// writes (the bulk route) or standalone (single create/update).
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
 * Sum of story points already committed to the sprint column of a workspace,
 * optionally excluding the tasks being moved/updated in the current request so
 * they are not double-counted.
 */
export async function sumSprintPoints(
  client: SprintDb,
  workspaceId: string,
  excludeTaskIds: string[] = [],
): Promise<number> {
  const agg = await client.task.aggregate({
    where: {
      workspaceId,
      status: TASK_STATUS.SPRINT,
      ...(excludeTaskIds.length ? { id: { notIn: excludeTaskIds } } : {}),
    },
    _sum: { points: true },
  });
  return agg._sum.points ?? 0;
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
    params.workspaceId,
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
