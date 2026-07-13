import type { Prisma, TaskStatusEventSource, TaskWorkflowState } from "@prisma/client";

type Tx = Prisma.TransactionClient;

export const recordWorkflowTransition = async (
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
  if (input.fromState === input.toState) return null;
  const task = await tx.task.findUnique({
    where: { id: input.taskId },
    select: { createdAt: true, dueDate: true, points: true, userId: true },
  });
  return tx.taskWorkflowEvent.create({
    data: {
      taskId: input.taskId,
      taskKey: input.taskId,
      taskCreatedAt: task?.createdAt,
      taskDueDate: task?.dueDate,
      taskPoints: task?.points,
      taskCreatorId: task?.userId,
      workspaceId: input.workspaceId,
      actorId: input.actorId,
      fromState: input.fromState,
      toState: input.toState,
      trigger: input.trigger,
      createdAt: input.createdAt,
    },
  });
};
