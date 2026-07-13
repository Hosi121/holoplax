import prisma from "../../../lib/prisma";
import type { ReviewQueryPort } from "../application/review-query";

const loadLeadTimeDays = async (workspaceId: string) => {
  const rows = await prisma.$queryRaw<Array<{ averageDays: number | null }>>`
    WITH latest_done AS (
      SELECT DISTINCT ON (event."taskKey")
        event."taskKey",
        event."taskCreatedAt",
        event."createdAt" AS "doneAt"
      FROM "TaskWorkflowEvent" event
      WHERE event."workspaceId" = ${workspaceId}
        AND event."toState" = 'DONE'
        AND event."taskCreatedAt" IS NOT NULL
      ORDER BY event."taskKey", event."createdAt" DESC, event.id DESC
    ), recent AS (
      SELECT * FROM latest_done ORDER BY "doneAt" DESC LIMIT 5
    )
    SELECT AVG(
      GREATEST(0, EXTRACT(EPOCH FROM ("doneAt" - "taskCreatedAt")) / 86400.0)
    )::double precision AS "averageDays"
    FROM recent
  `;
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

export const prismaReviewQueryPort: ReviewQueryPort = {
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
      prisma.sprint.findFirst({
        where: { workspaceId, status: "ACTIVE" },
        orderBy: { startedAt: "desc" },
        select: sprintSelect,
      }),
      prisma.sprint.findFirst({
        where: { workspaceId, status: "CLOSED" },
        orderBy: { endedAt: "desc" },
        select: sprintSelect,
      }),
      loadLeadTimeDays(workspaceId),
      prisma.task.count({
        where: {
          workspaceId,
          status: "BACKLOG",
          workflowState: { not: "CANCELED" },
          urgency: "HIGH",
        },
      }),
      prisma.task.count({
        where: {
          workspaceId,
          status: "BACKLOG",
          workflowState: { not: "CANCELED" },
          automationStatus: "SPLIT_PENDING",
        },
      }),
      prisma.task.count({
        where: {
          workspaceId,
          status: "BACKLOG",
          workflowState: { not: "CANCELED" },
          points: { lte: 3 },
        },
      }),
      prisma.velocityEntry.findMany({
        where: { workspaceId },
        orderBy: { createdAt: "desc" },
        take: 7,
        select: { id: true, points: true },
      }),
      prisma.taskDependency.count({
        where: {
          task: { workspaceId, workflowState: { not: "CANCELED" } },
          state: "REQUIRED",
          dependsOn: { workflowState: { not: "DONE" } },
        },
      }),
      prisma.taskStatusEvent.findMany({
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
      prisma.userAutomationSetting.findUnique({
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
