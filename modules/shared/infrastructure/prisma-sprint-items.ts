import type { Prisma, SprintItemEventType, SprintItemOutcome, TaskType } from "@prisma/client";

type Tx = Prisma.TransactionClient;

export type SprintCommitmentTask = {
  id: string;
  title: string;
  type: TaskType;
  points: number;
};

type SprintItemSnapshot = {
  id: string;
  taskTitle: string;
  taskType: TaskType;
  committedPoints: number;
};

const recordEvent = (
  tx: Tx,
  item: SprintItemSnapshot,
  type: SprintItemEventType,
  occurredAt: Date,
) =>
  tx.sprintItemEvent.create({
    data: {
      sprintItemId: item.id,
      type,
      taskTitle: item.taskTitle,
      taskType: item.taskType,
      committedPoints: item.committedPoints,
      occurredAt,
    },
  });

export const commitTaskToSprint = async (
  tx: Tx,
  input: { sprintId: string; task: SprintCommitmentTask; committedAt?: Date },
) => {
  const committedAt = input.committedAt ?? new Date();
  const existing = await tx.sprintItem.findUnique({
    where: { sprintId_taskKey: { sprintId: input.sprintId, taskKey: input.task.id } },
  });

  if (existing) {
    if (existing.removedAt !== null) {
      const recommitted = await tx.sprintItem.update({
        where: { id: existing.id },
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
      await recordEvent(tx, recommitted, "RECOMMITTED", committedAt);
      return recommitted;
    }
    if (existing.outcome === "COMPLETED") {
      const reopened = await tx.sprintItem.update({
        where: { id: existing.id },
        data: { taskId: input.task.id, outcome: "COMMITTED", completedAt: null },
      });
      await recordEvent(tx, reopened, "REOPENED", committedAt);
      return reopened;
    }
    return tx.sprintItem.update({
      where: { id: existing.id },
      data: { taskId: input.task.id },
    });
  }

  const carriedFrom = await tx.sprintItem.findFirst({
    where: {
      taskKey: input.task.id,
      outcome: "CARRYOVER",
      sprintId: { not: input.sprintId },
    },
    orderBy: { committedAt: "desc" },
    select: { id: true },
  });
  const created = await tx.sprintItem.create({
    data: {
      sprintId: input.sprintId,
      taskId: input.task.id,
      taskKey: input.task.id,
      taskTitle: input.task.title,
      taskType: input.task.type,
      committedPoints: input.task.points,
      committedAt,
      carriedFromId: carriedFrom?.id,
    },
  });
  await recordEvent(tx, created, "COMMITTED", committedAt);
  return created;
};

export const completeTaskCommitment = async (
  tx: Tx,
  input: { taskId: string; sprintId: string; completedAt?: Date },
) => {
  const completedAt = input.completedAt ?? new Date();
  const item = await tx.sprintItem.findUnique({
    where: { sprintId_taskKey: { sprintId: input.sprintId, taskKey: input.taskId } },
  });
  if (!item || item.removedAt !== null || item.outcome === "COMPLETED") return null;
  const completed = await tx.sprintItem.updateMany({
    where: { id: item.id, removedAt: null, outcome: { not: "COMPLETED" } },
    data: { outcome: "COMPLETED", completedAt },
  });
  if (!completed.count) return null;
  await recordEvent(tx, item, "COMPLETED", completedAt);
  return item;
};

export const removeTaskFromActiveSprint = async (
  tx: Tx,
  input: {
    taskId: string;
    outcome?: Extract<SprintItemOutcome, "REMOVED" | "CARRYOVER">;
    removedAt?: Date;
  },
) => {
  const outcome = input.outcome ?? "REMOVED";
  const removedAt = input.removedAt ?? new Date();
  const items = await tx.sprintItem.findMany({
    where: {
      taskKey: input.taskId,
      removedAt: null,
      sprint: { status: "ACTIVE" },
    },
  });
  if (!items.length) return { count: 0 };
  const updated = await tx.sprintItem.updateMany({
    where: { id: { in: items.map(({ id }) => id) }, removedAt: null },
    data: { outcome, removedAt },
  });
  if (updated.count) {
    await tx.sprintItemEvent.createMany({
      data: items.map((item) => ({
        sprintItemId: item.id,
        type: outcome,
        taskTitle: item.taskTitle,
        taskType: item.taskType,
        committedPoints: item.committedPoints,
        occurredAt: removedAt,
      })),
    });
  }
  return updated;
};

export const carryOverSprintCommitments = async (
  tx: Tx,
  input: { sprintId: string; carriedAt?: Date },
) => {
  const carriedAt = input.carriedAt ?? new Date();
  const items = await tx.sprintItem.findMany({
    where: { sprintId: input.sprintId, outcome: "COMMITTED", removedAt: null },
  });
  if (!items.length) return { count: 0 };
  const updated = await tx.sprintItem.updateMany({
    where: { id: { in: items.map(({ id }) => id) }, outcome: "COMMITTED", removedAt: null },
    data: { outcome: "CARRYOVER", removedAt: carriedAt },
  });
  if (updated.count) {
    await tx.sprintItemEvent.createMany({
      data: items.map((item) => ({
        sprintItemId: item.id,
        type: "CARRYOVER",
        taskTitle: item.taskTitle,
        taskType: item.taskType,
        committedPoints: item.committedPoints,
        occurredAt: carriedAt,
      })),
    });
  }
  return updated;
};
