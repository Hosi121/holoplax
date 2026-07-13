import prisma from "../../../lib/prisma";
import type { ReviewQueryPort } from "../application/review-query";

const sprintSelect = {
  id: true,
  name: true,
  capacityPoints: true,
  startedAt: true,
  plannedEndAt: true,
  endedAt: true,
} as const;

export const prismaReviewQueryPort: ReviewQueryPort = {
  async load(userId, workspaceId, activitySince) {
    const [
      activeSprint,
      latestClosedSprint,
      tasks,
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
      prisma.task.findMany({
        where: { workspaceId },
        orderBy: { createdAt: "desc" },
        take: 1000,
        select: {
          id: true,
          title: true,
          status: true,
          type: true,
          points: true,
          sprintId: true,
          urgency: true,
          automationState: true,
          createdAt: true,
          statusEvents: {
            where: { toStatus: "DONE" },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { createdAt: true },
          },
        },
      }),
      prisma.velocityEntry.findMany({
        where: { workspaceId },
        orderBy: { createdAt: "desc" },
        take: 7,
        select: { id: true, points: true },
      }),
      prisma.taskDependency.count({
        where: { task: { workspaceId }, dependsOn: { status: { not: "DONE" } } },
      }),
      prisma.taskStatusEvent.findMany({
        where: { workspaceId, createdAt: { gte: activitySince } },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
          id: true,
          fromStatus: true,
          toStatus: true,
          task: { select: { title: true } },
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
      tasks,
      velocityEntries,
      openDependencies,
      activity,
      automation,
    };
  },
};
