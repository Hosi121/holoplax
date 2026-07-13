export type VelocityEntry = {
  id: string;
  workspaceId: string | null;
  points: number;
  createdAt: Date;
};

type SprintTask = {
  sprintId: string;
  outcome: "COMMITTED" | "COMPLETED" | "REMOVED" | "CARRYOVER";
  committedPoints: number;
};

export interface VelocityQueryPort {
  load(workspaceId: string): Promise<{
    velocity: VelocityEntry[];
    closedSprintIds: string[];
    pbiTasks: SprintTask[];
  }>;
}

export const createVelocityQuery = (port: VelocityQueryPort) => async (workspaceId: string) => {
  const { velocity, closedSprintIds, pbiTasks } = await port.load(workspaceId);
  const recent = velocity.slice(0, 7).map(({ points }) => points);
  const avg = recent.length ? recent.reduce((sum, value) => sum + value, 0) / recent.length : 0;
  const variance = recent.length
    ? recent.reduce((sum, value) => sum + (value - avg) ** 2, 0) / recent.length
    : 0;
  const stdDev = Math.sqrt(variance);
  const latestSprintId = closedSprintIds[0] ?? null;
  const latestPbiTasks = latestSprintId
    ? pbiTasks.filter(({ sprintId }) => sprintId === latestSprintId)
    : [];
  const pbiDone = latestPbiTasks.filter(({ outcome }) => outcome === "COMPLETED");

  return {
    velocity,
    summary: {
      avg,
      variance,
      stdDev,
      stableRange: avg
        ? `${Math.max(0, avg - stdDev).toFixed(1)}-${(avg + stdDev).toFixed(1)}`
        : null,
    },
    pbi: {
      sprintId: latestSprintId,
      doneCount: pbiDone.length,
      donePoints: pbiDone.reduce((sum, task) => sum + task.committedPoints, 0),
      totalCount: latestPbiTasks.length,
      completionRate: latestPbiTasks.length ? pbiDone.length / latestPbiTasks.length : 0,
    },
  };
};
