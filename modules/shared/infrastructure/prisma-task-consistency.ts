import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

/**
 * Narrow cross-aggregate projections that must share another module's database
 * transaction. All general Task mutations remain owned by modules/tasks.
 */
export const applyTaskDescriptionAppendix = async (
  tx: Tx,
  input: {
    taskId: string;
    workspaceId: string;
    appendix: string;
    action: "apply" | "revert";
  },
) => {
  const task = await tx.task.findFirst({
    where: { id: input.taskId, workspaceId: input.workspaceId },
    select: { id: true, description: true },
  });
  if (!task) return null;
  const description =
    input.action === "apply"
      ? task.description.includes(input.appendix)
        ? task.description
        : `${task.description}${input.appendix}`
      : task.description.replace(input.appendix, "");
  if (description !== task.description) {
    await tx.task.update({ where: { id: task.id }, data: { description } });
  }
  return { id: task.id, description };
};

export const clearWorkspaceTaskAssignee = (
  tx: Tx,
  input: { workspaceId: string; assigneeId: string },
) =>
  tx.task.updateMany({
    where: { workspaceId: input.workspaceId, assigneeId: input.assigneeId },
    data: { assigneeId: null },
  });

export const attachLegacySprintProjection = (
  tx: Tx,
  input: { workspaceId: string; sprintId: string },
) =>
  tx.task.updateMany({
    where: { workspaceId: input.workspaceId, status: "SPRINT" },
    data: { sprintId: input.sprintId },
  });

export const clearClosedSprintProjection = (
  tx: Tx,
  input: { workspaceId: string; sprintId: string },
) =>
  tx.task.updateMany({
    where: {
      workspaceId: input.workspaceId,
      sprintId: input.sprintId,
      status: "SPRINT",
    },
    data: { status: "BACKLOG", sprintId: null },
  });
