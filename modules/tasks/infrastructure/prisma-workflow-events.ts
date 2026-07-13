import type { Prisma, TaskStatusEventSource, TaskWorkflowState } from "@prisma/client";

type Tx = Prisma.TransactionClient;

export const recordWorkflowTransition = (
  tx: Tx,
  input: {
    taskId: string;
    workspaceId: string;
    actorId: string;
    fromState: TaskWorkflowState | null;
    toState: TaskWorkflowState;
    trigger: TaskStatusEventSource;
    createdAt?: Date;
  },
) => {
  if (input.fromState === input.toState) return Promise.resolve(null);
  return tx.taskWorkflowEvent.create({
    data: {
      taskId: input.taskId,
      taskKey: input.taskId,
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      fromState: input.fromState,
      toState: input.toState,
      trigger: input.trigger,
      createdAt: input.createdAt,
    },
  });
};
