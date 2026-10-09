import db from "../../../lib/db";
import type { ReviewQueryPort } from "../application/review-query";

const loadLeadTimeDays = async (workspaceId: string) => {
  const rows = await db.query<{ averageDays: number | null }>(
    `
    WITH ranked AS (
      SELECT "taskCreatedAt", "createdAt" AS "doneAt",
        ROW_NUMBER() OVER (PARTITION BY "taskKey" ORDER BY "createdAt" DESC, "id" DESC) AS rank
      FROM "TaskWorkflowEvent"
      WHERE "workspaceId" = ? AND "toState" = 'DONE' AND "taskCreatedAt" IS NOT NULL
    ), recent AS (
      SELECT "taskCreatedAt", "doneAt" FROM ranked WHERE rank = 1 ORDER BY "doneAt" DESC LIMIT 5
    )
    SELECT AVG(MAX(0, ("doneAt" - "taskCreatedAt") / 86400000.0)) AS "averageDays" FROM recent
  `,
    [workspaceId],
  );
  return rows[0]?.averageDays ?? null;
};

const sprintSelect = {
  id: true,
  name: true,
  capacityPoints: true,
  startedAt: true,
  plannedEndAt: true,
  endedAt: true,
  items: {
    orderBy: { committedAt: "asc" },
    select: {
      taskKey: true,
      taskTitle: true,
      taskType: true,
      committedPoints: true,
      outcome: true,
      completedAt: true,
      removedAt: true,
      carriedFromId: true,
      events: {
        orderBy: { occurredAt: "asc" },
        select: {
          type: true,
          taskTitle: true,
          taskType: true,
          committedPoints: true,
          occurredAt: true,
        },
      },
    },
  },
} as const;

export const d1ReviewQueryPort: ReviewQueryPort = {
  async load(userId, workspaceId, activitySince) {
    const [
      activeSprint,
      latestClosedSprint,
      leadTimeDays,
      backlogHighPriority,
      backlogSplitPending,
      backlogSmallTasks,
      velocityEntries,
      openDependencies,
      activity,
      automation,
    ] = await Promise.all([
      db.sprint.findFirst({
        where: { workspaceId, status: "ACTIVE" },
        orderBy: { startedAt: "desc" },
        select: sprintSelect,
      }),
      db.sprint.findFirst({
        where: { workspaceId, status: "CLOSED" },
        orderBy: { endedAt: "desc" },
        select: sprintSelect,
      }),
      loadLeadTimeDays(workspaceId),
      db.task.count({
        where: {
          workspaceId,
          sprintId: null,
          workflowState: { notIn: ["DONE", "CANCELED"] },
          urgency: "HIGH",
        },
      }),
      db.task.count({
        where: {
          workspaceId,
          sprintId: null,
          workflowState: { notIn: ["DONE", "CANCELED"] },
          automationStatus: "SPLIT_PENDING",
        },
      }),
      db.task.count({
        where: {
          workspaceId,
          sprintId: null,
          workflowState: { notIn: ["DONE", "CANCELED"] },
          points: { lte: 3 },
        },
      }),
      db.velocityEntry.findMany({
        where: { workspaceId },
        orderBy: { createdAt: "desc" },
        take: 7,
        select: { id: true, points: true },
      }),
      db.taskDependency.count({
        where: {
          task: { workspaceId, workflowState: { not: "CANCELED" } },
          state: "REQUIRED",
          dependsOn: { workflowState: { not: "DONE" } },
        },
      }),
      db.taskStatusEvent.findMany({
        where: { workspaceId, createdAt: { gte: activitySince } },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
          id: true,
          fromStatus: true,
          toStatus: true,
          taskTitle: true,
        },
      }),
      db.userAutomationSetting.findUnique({
        where: { userId_workspaceId: { userId, workspaceId } },
        select: { high: true },
      }),
    ]);
    return {
      activeSprint,
      latestClosedSprint,
      leadTimeDays,
      backlogSummary: {
        highPriority: backlogHighPriority,
        splitPending: backlogSplitPending,
        smallTasks: backlogSmallTasks,
      },
      velocityEntries,
      openDependencies,
      activity,
      automation,
    };
  },
};
