import type { Prisma, SprintItemOutcome, TaskType } from "@prisma/client";

type Tx = Prisma.TransactionClient;

export type SprintCommitmentTask = {
  id: string;
  title: string;
  type: TaskType;
  points: number;
};

export const commitTaskToSprint = async (
  tx: Tx,
  input: { sprintId: string; task: SprintCommitmentTask; committedAt?: Date },
) => {
  const committedAt = input.committedAt ?? new Date();
  // A commitment is a historical estimate snapshot. Ordinary edits to the
  // task must not rewrite it. A task explicitly removed and later re-added is
  // a new commitment decision, so that is the only case that refreshes it.
  await tx.sprintItem.updateMany({
    where: {
      sprintId: input.sprintId,
      taskKey: input.task.id,
      removedAt: { not: null },
    },
    data: {
      taskId: input.task.id,
      taskTitle: input.task.title,
      taskType: input.task.type,
      committedPoints: input.task.points,
      outcome: "COMMITTED",
      committedAt,
      completedAt: null,
      removedAt: null,
    },
  });
  await tx.sprintItem.updateMany({
    where: {
      sprintId: input.sprintId,
      taskKey: input.task.id,
      outcome: "COMPLETED",
      removedAt: null,
    },
    data: {
      outcome: "COMMITTED",
      completedAt: null,
    },
  });
  return tx.sprintItem.upsert({
    where: {
      sprintId_taskKey: { sprintId: input.sprintId, taskKey: input.task.id },
    },
    create: {
      sprintId: input.sprintId,
      taskId: input.task.id,
      taskKey: input.task.id,
      taskTitle: input.task.title,
      taskType: input.task.type,
      committedPoints: input.task.points,
      committedAt,
    },
    update: {
      // Preserve every snapshot field for an already-active commitment.
      taskId: input.task.id,
    },
  });
};

export const completeTaskCommitment = (
  tx: Tx,
  input: { taskId: string; sprintId: string; completedAt?: Date },
) =>
  tx.sprintItem.updateMany({
    where: {
      sprintId: input.sprintId,
      taskKey: input.taskId,
      removedAt: null,
    },
    data: {
      outcome: "COMPLETED",
      completedAt: input.completedAt ?? new Date(),
    },
  });

export const removeTaskFromActiveSprint = (
  tx: Tx,
  input: {
    taskId: string;
    outcome?: Extract<SprintItemOutcome, "REMOVED" | "CARRYOVER">;
    removedAt?: Date;
  },
) =>
  tx.sprintItem.updateMany({
    where: {
      taskKey: input.taskId,
      removedAt: null,
      sprint: { status: "ACTIVE" },
    },
    data: {
      outcome: input.outcome ?? "REMOVED",
      removedAt: input.removedAt ?? new Date(),
    },
  });
