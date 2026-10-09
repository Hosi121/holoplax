import db from "../../../lib/db";
import type { VelocityQueryPort } from "../application/velocity-query";

export const d1VelocityQueryPort: VelocityQueryPort = {
  async load(workspaceId) {
    const [velocity, sprints] = await Promise.all([
      db.velocityEntry.findMany({
        where: { workspaceId },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      db.sprint.findMany({
        where: { workspaceId, status: "CLOSED" },
        orderBy: { endedAt: "desc" },
        select: { id: true },
        take: 3,
      }),
    ]);
    const closedSprintIds = sprints.map(({ id }) => id);
    const pbiTasks = closedSprintIds.length
      ? await db.sprintItem.findMany({
          where: { sprintId: { in: closedSprintIds }, taskType: "PBI" },
          select: { sprintId: true, outcome: true, committedPoints: true },
        })
      : [];
    return { velocity, closedSprintIds, pbiTasks };
  },
};
