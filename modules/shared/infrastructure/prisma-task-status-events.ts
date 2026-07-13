import type { Prisma, TaskStatus, TaskStatusEventSource } from "@prisma/client";

type Tx = Prisma.TransactionClient;

export type TaskStatusTransition = {
  taskId: string;
  taskTitle: string;
  fromStatus: TaskStatus | null;
  toStatus: TaskStatus;
  actorId: string;
  trigger: TaskStatusEventSource;
  workspaceId: string;
  createdAt?: Date;
};

const toEventData = (transition: TaskStatusTransition) => ({
  taskId: transition.taskId,
  taskKey: transition.taskId,
  taskTitle: transition.taskTitle,
  fromStatus: transition.fromStatus,
  toStatus: transition.toStatus,
  actorId: transition.actorId,
  trigger: transition.trigger,
  workspaceId: transition.workspaceId,
  createdAt: transition.createdAt,
});

/** Record a compatibility planning transition with deletion-safe snapshots. */
export const recordTaskStatusTransition = (tx: Tx, transition: TaskStatusTransition) => {
  if (transition.fromStatus === transition.toStatus) return Promise.resolve(null);
  return tx.taskStatusEvent.create({ data: toEventData(transition) });
};

/** Record several snapshot transitions without exposing the table to callers. */
export const recordTaskStatusTransitions = (tx: Tx, transitions: TaskStatusTransition[]) => {
  const changed = transitions.filter(({ fromStatus, toStatus }) => fromStatus !== toStatus);
  if (!changed.length) return Promise.resolve({ count: 0 });
  return tx.taskStatusEvent.createMany({ data: changed.map(toEventData) });
};
