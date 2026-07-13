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

export type ReviewTask = {
  id: string;
  title: string;
  status: "BACKLOG" | "SPRINT" | "DONE";
  workflowState: "READY" | "IN_PROGRESS" | "BLOCKED" | "DONE" | "CANCELED";
  type: "EPIC" | "PBI" | "TASK";
  points: number;
  sprintId: string | null;
  urgency: "LOW" | "MEDIUM" | "HIGH";
  automationStatus: "NONE" | "PREPARED" | "SPLIT_PENDING" | "SPLIT_REJECTED";
  hierarchyRole: "STANDARD" | "SPLIT_PARENT" | "SPLIT_CHILD";
  origin: "MANUAL" | "INTAKE" | "AUTOMATION" | "ROUTINE" | "ONBOARDING";
  createdAt: Date;
  workflowEvents: Array<{ createdAt: Date }>;
};

export interface ReviewQueryPort {
  load(userId: string, workspaceId: string, activitySince: Date): Promise<ReviewSnapshot>;
}

export const createReviewQuery =
  (port: ReviewQueryPort) => (userId: string, workspaceId: string, activitySince: Date) =>
    port.load(userId, workspaceId, activitySince);
