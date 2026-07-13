import type {
  Prisma,
  RoutineCadence,
  Severity,
  TaskAutomationState,
  TaskAutomationStatus,
  TaskHierarchyRole,
  TaskOrigin,
  TaskStatus,
  TaskStatusEventSource,
  TaskType,
  TaskWorkflowState,
} from "@prisma/client";
import { randomUUID } from "crypto";
import { ApplicationError } from "../../shared/application/application-error";
import { commitTaskToSprint } from "../../shared/infrastructure/prisma-sprint-items";
import { recordTaskStatusTransition } from "../../shared/infrastructure/prisma-task-status-events";
import { findTaskPolicyViolation } from "../domain/task-policy";
import { initialWorkflowState } from "../domain/task-workflow";
import { recordWorkflowTransition } from "./prisma-workflow-events";

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
  workflowState?: TaskWorkflowState;
  type: TaskType;
  automationState?: TaskAutomationState;
  automationStatus?: TaskAutomationStatus;
  hierarchyRole?: TaskHierarchyRole;
  origin?: TaskOrigin;
  parentId?: string | null;
  sprintId?: string | null;
  dueDate?: Date | null;
  assigneeId?: string | null;
  tags?: string[];
  userId: string;
  workspaceId: string;
  routineSeriesId?: string | null;
  dependencyIds?: string[];
  routineRule?: { cadence: RoutineCadence; nextAt: Date; seriesId?: string } | null;
};

export async function persistNewTask(
  tx: Tx,
  input: PersistTaskInput,
  event: { actorId: string; trigger: TaskStatusEventSource },
) {
  const violation = findTaskPolicyViolation({
    type: input.type,
    status: input.status,
    workflowState: input.workflowState,
    checklist: input.checklist,
  });
  if (violation) {
    throw new ApplicationError("TASK_BAD_REQUEST", violation, "bad_request");
  }

  const workflowState = initialWorkflowState(input.status, input.workflowState);
  const routineSeriesId =
    input.routineSeriesId ??
    input.routineRule?.seriesId ??
    (input.routineRule ? randomUUID() : null);
  if (input.routineRule && routineSeriesId) {
    await tx.routineSeries.upsert({
      where: { id: routineSeriesId },
      create: {
        id: routineSeriesId,
        cadence: input.routineRule.cadence,
        nextAt: input.routineRule.nextAt,
        workspaceId: input.workspaceId,
        createdById: input.userId,
      },
      update: {
        cadence: input.routineRule.cadence,
        nextAt: input.routineRule.nextAt,
        active: true,
      },
    });
  }
  const created = await tx.task.create({
    data: {
      title: input.title,
      description: input.description ?? "",
      definitionOfDone: input.definitionOfDone ?? "",
      checklist: input.checklist,
      points: input.points,
      urgency: input.urgency,
      risk: input.risk,
      status: input.status,
      workflowState,
      type: input.type,
      automationState: input.automationState,
      automationStatus: input.automationStatus,
      hierarchyRole: input.hierarchyRole,
      origin: input.origin,
      parentId: input.parentId,
      sprintId: input.sprintId,
      dueDate: input.dueDate,
      assigneeId: input.assigneeId,
      tags: input.tags ?? [],
      userId: input.userId,
      workspaceId: input.workspaceId,
      routineSeriesId,
      routineRule:
        input.routineRule && routineSeriesId
          ? {
              create: {
                cadence: input.routineRule.cadence,
                nextAt: input.routineRule.nextAt,
                seriesId: routineSeriesId,
              },
            }
          : undefined,
      dependencies: input.dependencyIds?.length
        ? {
            createMany: {
              data: input.dependencyIds.map((dependsOnId) => ({
                dependsOnId,
                workspaceId: input.workspaceId,
              })),
              skipDuplicates: true,
            },
          }
        : undefined,
    },
  });
  await recordTaskStatusTransition(tx, {
    taskId: created.id,
    taskTitle: created.title,
    fromStatus: null,
    toStatus: input.status,
    actorId: event.actorId,
    trigger: event.trigger,
    workspaceId: input.workspaceId,
  });
  const dependencyIds = [...new Set(input.dependencyIds ?? [])].filter(
    (dependsOnId) => dependsOnId !== created.id,
  );
  if (dependencyIds.length) {
    await tx.taskDependencyEvent.createMany({
      data: dependencyIds.map((dependsOnId) => ({
        taskId: created.id,
        taskKey: created.id,
        dependsOnId,
        dependsOnKey: dependsOnId,
        type: "REQUIRED" as const,
        actorId: event.actorId,
        workspaceId: input.workspaceId,
        reason: "TASK_CREATED",
      })),
    });
  }
  await recordWorkflowTransition(tx, {
    taskId: created.id,
    workspaceId: input.workspaceId,
    actorId: event.actorId,
    fromState: null,
    toState: workflowState,
    trigger: event.trigger,
  });
  if (input.sprintId) {
    await commitTaskToSprint(tx, { sprintId: input.sprintId, task: created });
  }
  return created;
}
