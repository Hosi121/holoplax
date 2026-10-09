import type {
  Db,
  RoutineCadence,
  Severity,
  TaskAutomationStatus,
  TaskHierarchyRole,
  TaskOrigin,
  TaskStatus,
  TaskStatusEventSource,
  TaskType,
  TaskWorkflowState,
} from "../../../database/models";
import { ApplicationError } from "../../shared/application/application-error";
import { commitTaskToSprint } from "../../shared/infrastructure/d1-sprint-items";
import { recordTaskStatusTransition } from "../../shared/infrastructure/d1-task-status-events";
import { findTaskPolicyViolation } from "../domain/task-policy";
import { initialWorkflowState } from "../domain/task-workflow";
import { recordWorkflowTransition } from "./d1-workflow-events";

type Tx = Db.TransactionClient;

export type PersistTaskInput = {
  title: string;
  description?: string;
  definitionOfDone?: string;
  checklist?: Db.NullableJsonNullValueInput | Db.InputJsonValue;
  points: number;
  urgency: Severity;
  risk: Severity;
  status: TaskStatus;
  workflowState?: TaskWorkflowState;
  type: TaskType;
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
    (input.routineRule ? crypto.randomUUID() : null);
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
      workflowState,
      type: input.type,
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
    },
  });
  if (input.routineRule && routineSeriesId) {
    await tx.routineRule.create({
      data: {
        taskId: created.id,
        cadence: input.routineRule.cadence,
        nextAt: input.routineRule.nextAt,
        seriesId: routineSeriesId,
      },
    });
  }
  if (input.dependencyIds?.length) {
    await tx.taskDependency.createMany({
      data: [...new Set(input.dependencyIds)].map((dependsOnId) => ({
        taskId: created.id,
        dependsOnId,
        workspaceId: input.workspaceId,
      })),
      skipDuplicates: true,
    });
  }
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
