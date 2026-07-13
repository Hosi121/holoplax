import prisma from "../../../lib/prisma";
import type { VelocityQueryPort } from "../application/velocity-query";

export const prismaVelocityQueryPort: VelocityQueryPort = {
  async load(workspaceId) {
    const [velocity, sprints] = await Promise.all([
      prisma.velocityEntry.findMany({
        where: { workspaceId },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.sprint.findMany({
        where: { workspaceId, status: "CLOSED" },
        orderBy: { endedAt: "desc" },
        select: { id: true },
        take: 3,
      }),
    ]);
    const closedSprintIds = sprints.map(({ id }) => id);
    const pbiTasks = closedSprintIds.length
      ? await prisma.sprintItem.findMany({
          where: { sprintId: { in: closedSprintIds }, taskType: "PBI" },
          select: { sprintId: true, outcome: true, committedPoints: true },
        })
      : [];
    return { velocity, closedSprintIds, pbiTasks };
  },
};
