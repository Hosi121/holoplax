import type {
  Prisma,
  RoutineCadence,
  Severity,
  TaskAutomationState,
  TaskStatus,
  TaskStatusEventSource,
  TaskType,
} from "@prisma/client";
import { ApplicationError } from "../../shared/application/application-error";
import { findTaskPolicyViolation } from "../domain/task-policy";

type Tx = Prisma.TransactionClient;

export type PersistTaskInput = {
  title: string;
  description?: string;
  definitionOfDone?: string;
  checklist?: Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue;
  points: number;
  urgency: Severity;
  risk: Severity;
  status: TaskStatus;
  type: TaskType;
  automationState?: TaskAutomationState;
  parentId?: string | null;
  sprintId?: string | null;
  dueDate?: Date | null;
  assigneeId?: string | null;
  tags?: string[];
  userId: string;
  workspaceId: string;
  dependencyIds?: string[];
  routineRule?: { cadence: RoutineCadence; nextAt: Date } | null;
};

export async function persistNewTask(
  tx: Tx,
  input: PersistTaskInput,
  event: { actorId: string; trigger: TaskStatusEventSource },
) {
  const violation = findTaskPolicyViolation({
    type: input.type,
    status: input.status,
    checklist: input.checklist,
  });
  if (violation) {
    throw new ApplicationError("TASK_BAD_REQUEST", violation, "bad_request");
  }

  return tx.task.create({
    data: {
      title: input.title,
      description: input.description ?? "",
      definitionOfDone: input.definitionOfDone ?? "",
      checklist: input.checklist,
      points: input.points,
      urgency: input.urgency,
      risk: input.risk,
      status: input.status,
      type: input.type,
      automationState: input.automationState,
      parentId: input.parentId,
      sprintId: input.sprintId,
      dueDate: input.dueDate,
      assigneeId: input.assigneeId,
      tags: input.tags ?? [],
      userId: input.userId,
      workspaceId: input.workspaceId,
      routineRule: input.routineRule ? { create: input.routineRule } : undefined,
      dependencies: input.dependencyIds?.length
        ? {
            createMany: {
              data: input.dependencyIds.map((dependsOnId) => ({ dependsOnId })),
              skipDuplicates: true,
            },
          }
        : undefined,
      statusEvents: {
        create: {
          fromStatus: null,
          toStatus: input.status,
          actorId: event.actorId,
          trigger: event.trigger,
          workspaceId: input.workspaceId,
        },
      },
    },
  });
}
