export type ReviewSnapshot = {
  activeSprint: ReviewSprint | null;
  latestClosedSprint: ReviewSprint | null;
  leadTimeDays: number | null;
  backlogSummary: {
    highPriority: number;
    splitPending: number;
    smallTasks: number;
  };
  velocityEntries: Array<{ id: string; points: number }>;
  openDependencies: number;
  activity: Array<{
    id: string;
    fromStatus: "BACKLOG" | "SPRINT" | "DONE" | null;
    toStatus: "BACKLOG" | "SPRINT" | "DONE";
    taskTitle: string;
  }>;
  automation: { high: number } | null;
};

export type ReviewSprint = {
  id: string;
  name: string;
  capacityPoints: number;
  startedAt: Date;
  plannedEndAt: Date | null;
  endedAt: Date | null;
  items: ReviewSprintItem[];
};

export type ReviewSprintItem = {
  taskKey: string;
  taskTitle: string;
  taskType: "EPIC" | "PBI" | "TASK";
  committedPoints: number;
  outcome: "COMMITTED" | "COMPLETED" | "REMOVED" | "CARRYOVER";
  completedAt: Date | null;
  removedAt: Date | null;
  carriedFromId: string | null;
  events: Array<{
    type: "COMMITTED" | "RECOMMITTED" | "COMPLETED" | "REOPENED" | "REMOVED" | "CARRYOVER";
    taskTitle: string;
    taskType: "EPIC" | "PBI" | "TASK";
    committedPoints: number;
    occurredAt: Date;
  }>;
};

export interface ReviewQueryPort {
  load(userId: string, workspaceId: string, activitySince: Date): Promise<ReviewSnapshot>;
}

export const createReviewQuery =
  (port: ReviewQueryPort) => (userId: string, workspaceId: string, activitySince: Date) =>
    port.load(userId, workspaceId, activitySince);
