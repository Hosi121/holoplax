import prisma from "../../../lib/prisma";
import { projectLegacyAutomationState } from "../domain/task-automation";

export function rejectPendingTaskSplit(
  actor: { userId: string; workspaceId: string },
  taskId: string,
) {
  return prisma.$transaction(async (tx) => {
    const task = await tx.task.findFirst({
      where: { id: taskId, workspaceId: actor.workspaceId },
      select: { hierarchyRole: true },
    });
    if (!task) return false;
    const claimed = await tx.task.updateMany({
      where: { id: taskId, workspaceId: actor.workspaceId, automationStatus: "SPLIT_PENDING" },
      data: {
        automationStatus: "SPLIT_REJECTED",
        automationState: projectLegacyAutomationState({
          automationStatus: "SPLIT_REJECTED",
          hierarchyRole: task.hierarchyRole,
        }),
      },
    });
    if (!claimed.count) return false;
    await tx.auditLog.create({
      data: {
        actorId: actor.userId,
        action: "AUTOMATION_SPLIT_REJECT",
        targetWorkspaceId: actor.workspaceId,
        metadata: { taskId },
      },
    });
    return true;
  });
}
