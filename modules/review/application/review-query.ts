export type ReviewSnapshot = {
  activeSprint: ReviewSprint | null;
  latestClosedSprint: ReviewSprint | null;
  tasks: ReviewTask[];
  velocityEntries: Array<{ id: string; points: number }>;
  openDependencies: number;
  activity: Array<{
    id: string;
    fromStatus: "BACKLOG" | "SPRINT" | "DONE" | null;
    toStatus: "BACKLOG" | "SPRINT" | "DONE";
    task: { title: string };
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
};

export type ReviewTask = {
  id: string;
  title: string;
  status: "BACKLOG" | "SPRINT" | "DONE";
  type: "EPIC" | "PBI" | "TASK";
  points: number;
  sprintId: string | null;
  urgency: "LOW" | "MEDIUM" | "HIGH";
  automationState: string;
  createdAt: Date;
  statusEvents: Array<{ createdAt: Date }>;
};

export interface ReviewQueryPort {
  load(userId: string, workspaceId: string, activitySince: Date): Promise<ReviewSnapshot>;
}

export const createReviewQuery =
  (port: ReviewQueryPort) => (userId: string, workspaceId: string, activitySince: Date) =>
    port.load(userId, workspaceId, activitySince);
