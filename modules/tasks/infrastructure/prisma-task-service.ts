import type { Prisma, Task, TaskStatus } from "@prisma/client";
import { randomUUID } from "crypto";
import type { z } from "zod";
import { normalizeSeverity } from "../../../lib/ai-normalization";
import type { TaskCreateSchema, TaskUpdateSchema } from "../../../lib/contracts/task";
import { logger } from "../../../lib/logger";
import { isStoryPoint } from "../../../lib/points";
import prisma from "../../../lib/prisma";
import { isTaskStatus, isTaskType } from "../../../lib/tasks/task-values";
import { TASK_STATUS, TASK_TYPE } from "../../../lib/types";
import { ApplicationError } from "../../shared/application/application-error";
import { runSerializableTransaction } from "../../shared/infrastructure/prisma-serializable-transaction";
import {
  commitTaskToSprint,
  completeTaskCommitment,
  removeTaskFromActiveSprint,
} from "../../shared/infrastructure/prisma-sprint-items";
import { recordTaskStatusTransition } from "../../shared/infrastructure/prisma-task-status-events";
import { planTaskLifecycleUpdate } from "../application/task-lifecycle";
import type { TaskActor } from "../application/task-types";
import { projectLegacyAutomationState } from "../domain/task-automation";
import { findTaskHierarchyViolation, findTaskPolicyViolation } from "../domain/task-policy";
import {
  conflictingLifecycleRequest,
  deriveLegacyStatus,
  initialWorkflowState,
  projectLegacyStatus,
} from "../domain/task-workflow";
import { checkSprintCapacity, findActiveSprint } from "./prisma-sprint-capacity";
import { enqueueTaskAutomation, wakeTaskAutomationWorker } from "./prisma-task-automation-jobs";
import {
  createNextRoutineOccurrence,
  deactivateRoutineSeriesForDeletedTask,
  nextRoutineAt,
  syncRoutineRule,
  syncTaskDependencies,
  taskDependencyWouldCycle,
  taskParentWouldCycle,
  toNullableJsonInput,
} from "./prisma-task-write";
import { persistNewTask } from "./prisma-task-writer";
import { recordWorkflowTransition } from "./prisma-workflow-events";

export type TaskCreateInput = z.infer<typeof TaskCreateSchema>;
export type TaskUpdateInput = z.infer<typeof TaskUpdateSchema>;
type ProjectedTask = Task & { status: TaskStatus };

const badRequest = (message: string) =>
  new ApplicationError("TASK_BAD_REQUEST", message, "bad_request");
const notFound = (message = "not found") =>
  new ApplicationError("TASK_NOT_FOUND", message, "not_found");

const runSerializableTaskTransaction = async <T>(
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
) =>
  runSerializableTransaction(operation, {
    code: "TASK_CONCURRENT_UPDATE",
    message: "task changed concurrently; retry the operation",
  });

// On create, an absent/invalid checklist is normalized to null (cleared).
const toChecklistForCreate = (value: unknown) => {
  if (!Array.isArray(value)) return null;
  return value
    .map((item) => ({
      id: typeof item?.id === "string" ? item.id : randomUUID(),
      text: String(item?.text ?? "").trim(),
      done: Boolean(item?.done),
    }))
    .filter((item) => item.text.length > 0);
};

// On update, `undefined` means "leave unchanged" while `null` means "clear".
const toChecklistForUpdate = (value: unknown) => {
  if (value === null) return null;
  if (!Array.isArray(value)) return undefined;
  return value
    .map((item) => ({
      id: typeof item?.id === "string" ? item.id : randomUUID(),
      text: String(item?.text ?? "").trim(),
      done: Boolean(item?.done),
    }))
    .filter((item) => item.text.length > 0);
};

/**
 * Create a task and its side effects (routine rule, dependency edges, status
 * event, audit log, automation). Caller supplies the authenticated identity and
 * the validated request body.
 */
export async function createTask(actor: TaskActor, input: TaskCreateInput): Promise<ProjectedTask> {
  const { userId, workspaceId, origin } = actor;
  const {
    title,
    description,
    definitionOfDone,
    checklist,
    points,
    urgency,
    risk,
    status,
    workflowState,
    type,
    parentId,
    dueDate,
    assigneeId,
    tags,
    dependencyIds,
    routineCadence,
    routineNextAt,
  } = input;
  logger.debug("TASK_CREATE input", {
    status,
    type,
    checklistType: Array.isArray(checklist) ? "array" : typeof checklist,
    checklistNull: checklist === null,
  });
  if (!isStoryPoint(points)) {
    throw badRequest("points must be one of 1,2,3,5,8,13,21,34");
  }
  if (conflictingLifecycleRequest({ status, workflowState })) {
    throw badRequest("status and workflowState describe conflicting lifecycle states");
  }
  const dependencyList = Array.isArray(dependencyIds)
    ? dependencyIds.map((id: string) => String(id))
    : [];
  const requestedStatus = isTaskStatus(status) ? status : undefined;
  const workflowStateValue = initialWorkflowState(
    requestedStatus ?? TASK_STATUS.BACKLOG,
    workflowState,
  );
  const statusValue = projectLegacyStatus({
    current: TASK_STATUS.BACKLOG,
    requestedStatus,
    workflowState: workflowStateValue,
  });
  const typeValue = isTaskType(type) ? type : TASK_TYPE.PBI;
  logger.debug("TASK_CREATE narrowed", { statusValue, typeValue });
  const parentCandidate = parentId ? String(parentId) : null;
  const cadenceValue =
    routineCadence === "DAILY" || routineCadence === "WEEKLY" ? routineCadence : null;
  const normalizedChecklist = toChecklistForCreate(checklist);

  const task = await runSerializableTaskTransaction(async (tx) => {
    // All state-dependent validation shares the write transaction. This
    // prevents concurrent sprint additions from both passing capacity checks.
    const [member, allowedDependencies, parent, activeSprint] = await Promise.all([
      assigneeId
        ? tx.workspaceMember.findUnique({
            where: { workspaceId_userId: { workspaceId, userId: assigneeId } },
            select: { userId: true },
          })
        : Promise.resolve(null),
      dependencyList.length
        ? tx.task.findMany({
            where: { id: { in: dependencyList }, workspaceId },
            select: { id: true, workflowState: true },
          })
        : Promise.resolve([]),
      parentCandidate
        ? tx.task.findFirst({
            where: { id: parentCandidate, workspaceId },
            select: {
              id: true,
              type: true,
              workflowState: true,
              sprint: { select: { status: true } },
            },
          })
        : Promise.resolve(null),
      statusValue === TASK_STATUS.SPRINT
        ? findActiveSprint(tx, workspaceId)
        : Promise.resolve(null),
    ]);
    const uniqueRequestedDependencies = [...new Set(dependencyList.filter(Boolean))];
    if (assigneeId && !member) throw badRequest("assignee must be a workspace member");
    if (parentCandidate && !parent) throw badRequest("parent task not found in workspace");
    const hierarchyViolation = findTaskHierarchyViolation({
      type: typeValue,
      parentType: parent?.type,
    });
    if (hierarchyViolation) throw badRequest(hierarchyViolation);
    if (
      parent &&
      deriveLegacyStatus({
        workflowState: parent.workflowState,
        isInActiveSprint: parent.sprint?.status === "ACTIVE",
      }) === TASK_STATUS.SPRINT
    ) {
      throw badRequest("remove a parent from the sprint before adding child work items");
    }
    if (allowedDependencies.length !== uniqueRequestedDependencies.length) {
      throw badRequest("one or more dependencies were not found in workspace");
    }

    const policyViolation = findTaskPolicyViolation({
      type: typeValue,
      status: statusValue,
      workflowState: workflowStateValue,
      checklist: normalizedChecklist,
      hasUnresolvedDependencies: allowedDependencies.some(
        (dependency) => dependency.workflowState !== "DONE",
      ),
    });
    if (policyViolation) throw badRequest(policyViolation);
    if (statusValue === TASK_STATUS.SPRINT && !activeSprint) {
      throw badRequest("active sprint not found");
    }
    if (activeSprint) {
      const { exceeded } = await checkSprintCapacity(tx, {
        workspaceId,
        additionalPoints: Number(points),
        activeSprint,
      });
      if (exceeded) throw badRequest("sprint capacity exceeded");
    }

    const allowedDependencyIds = new Set(allowedDependencies.map(({ id }) => id));
    const dependsOnIds = [
      ...new Set(dependencyList.filter((id) => id && allowedDependencyIds.has(id))),
    ];
    const created = await persistNewTask(
      tx,
      {
        title,
        description: description ?? "",
        definitionOfDone: typeof definitionOfDone === "string" ? definitionOfDone : "",
        checklist: toNullableJsonInput(normalizedChecklist),
        points: Number(points),
        urgency: normalizeSeverity(urgency),
        risk: normalizeSeverity(risk),
        status: statusValue,
        workflowState: workflowStateValue,
        dueDate: dueDate ? new Date(dueDate) : null,
        tags: Array.isArray(tags) ? tags.map(String) : [],
        type: typeValue,
        sprintId: activeSprint?.id ?? null,
        parentId: parent?.id ?? null,
        assigneeId: assigneeId && member ? assigneeId : null,
        userId,
        workspaceId,
        origin,
        dependencyIds: dependsOnIds,
        routineRule: cadenceValue
          ? {
              cadence: cadenceValue,
              nextAt: routineNextAt
                ? new Date(routineNextAt)
                : nextRoutineAt(cadenceValue, dueDate ? new Date(dueDate) : new Date()),
            }
          : null,
      },
      { actorId: userId, trigger: "API" },
    );
    await tx.auditLog.create({
      data: {
        actorId: userId,
        action: "TASK_CREATE",
        targetWorkspaceId: workspaceId,
        metadata: { taskId: created.id, status: statusValue },
      },
    });
    await enqueueTaskAutomation(tx, {
      task: created,
      workspaceId,
      requestedById: userId,
    });
    return created;
  });

  wakeTaskAutomationWorker();
  return { ...task, status: statusValue };
}

/**
 * Apply a partial update to a task within a single transaction (field changes,
 * dependency/routine reconciliation, audit, status event, and routine-completion
 * cloning), then run automation. Throws on a missing task or invalid transition.
 */
export async function updateTask(
  actor: TaskActor,
  id: string,
  body: TaskUpdateInput,
): Promise<ProjectedTask> {
  const { userId, workspaceId } = actor;
  logger.debug("TASK_UPDATE input", {
    id,
    status: body.status,
    type: body.type,
    checklistType: Array.isArray(body.checklist) ? "array" : typeof body.checklist,
    checklistNull: body.checklist === null,
  });
  if (
    conflictingLifecycleRequest({
      status: body.status,
      workflowState: body.workflowState,
    })
  ) {
    throw badRequest("status and workflowState describe conflicting lifecycle states");
  }
  const baseData: Record<string, unknown> = {};

  if (body.title) baseData.title = body.title;
  if (typeof body.description === "string") baseData.description = body.description;
  if (typeof body.definitionOfDone === "string") {
    baseData.definitionOfDone = body.definitionOfDone;
  }
  const checklistValue = toChecklistForUpdate(body.checklist);
  if (checklistValue !== undefined) {
    baseData.checklist = checklistValue;
  }
  // points is already a valid Fibonacci number (TaskPointsSchema validated at parse time)
  if (body.points !== undefined && body.points !== null) {
    baseData.points = body.points;
  }
  if (body.urgency) baseData.urgency = body.urgency;
  if (body.risk) baseData.risk = body.risk;
  // type is already a valid TaskType (TaskTypeSchema validated at parse time)
  if (body.type !== undefined) {
    baseData.type = body.type;
  }
  // automationState is intentionally not writable by users.
  // It is managed exclusively by the server-side automation engine.
  if (body.dueDate !== undefined) {
    baseData.dueDate = body.dueDate ? new Date(body.dueDate) : null;
  }
  if (body.tags !== undefined) {
    baseData.tags = Array.isArray(body.tags) ? body.tags.map((tag: string) => String(tag)) : [];
  }
  // The legacy status remains an API compatibility projection. Its planning
  // placement and the execution workflow are resolved after loading the
  // current aggregate below.
  const requestedStatus = (body.status as TaskStatus | undefined) ?? null;
  const requestedDependencyIds = Array.isArray(body.dependencyIds)
    ? [...new Set(body.dependencyIds.map(String))]
    : null;
  if (requestedDependencyIds?.includes(id)) {
    throw badRequest("a task cannot depend on itself");
  }
  const cadenceValue =
    body.routineCadence === "DAILY" || body.routineCadence === "WEEKLY"
      ? body.routineCadence
      : null;
  const shouldClearRoutine =
    body.routineCadence === null || body.routineCadence === "" || body.routineCadence === "NONE";
  const routineNextAt =
    body.routineNextAt !== undefined && body.routineNextAt !== null
      ? new Date(body.routineNextAt)
      : null;

  const { task } = await runSerializableTaskTransaction(async (tx) => {
    // A serializable transaction can be retried after a write conflict. Start
    // each attempt from immutable request data so mutations calculated from a
    // stale snapshot cannot leak into the next attempt.
    const data: Record<string, unknown> = { ...baseData };
    // Every state-dependent read participates in the same serializable
    // transaction as the write. Concurrent capacity, hierarchy, dependency,
    // and workflow changes therefore cannot both commit from stale snapshots.
    const currentTask = await tx.task.findFirst({
      where: { id, workspaceId },
      include: {
        routineRule: true,
        parent: {
          select: {
            type: true,
            workflowState: true,
            sprint: { select: { status: true } },
          },
        },
        children: { select: { type: true, workflowState: true } },
        sprint: { select: { status: true } },
        dependencies:
          requestedStatus === TASK_STATUS.DONE ||
          body.workflowState === "IN_PROGRESS" ||
          body.workflowState === "BLOCKED" ||
          body.workflowState === "DONE"
            ? {
                where: { state: "REQUIRED", dependsOn: { workflowState: { not: "DONE" } } },
                select: {
                  dependsOn: {
                    select: { id: true, title: true, workflowState: true },
                  },
                },
              }
            : false,
      },
    });
    if (!currentTask) {
      throw notFound();
    }

    const requestedDependencies = requestedDependencyIds
      ? await tx.task.findMany({
          where: { id: { in: requestedDependencyIds }, workspaceId },
          select: { id: true, workflowState: true },
        })
      : null;
    if (requestedDependencies && requestedDependencies.length !== requestedDependencyIds?.length) {
      throw badRequest("one or more dependencies were not found in workspace");
    }

    const currentStatus = deriveLegacyStatus({
      workflowState: currentTask.workflowState,
      isInActiveSprint: currentTask.sprint?.status === "ACTIVE",
    });
    const lifecycle = planTaskLifecycleUpdate({
      currentStatus,
      currentWorkflowState: currentTask.workflowState,
      requestedStatus,
      requestedWorkflowState: body.workflowState,
      policy: {
        type: (body.type ?? currentTask.type) as "EPIC" | "PBI" | "TASK",
        checklist: checklistValue === undefined ? currentTask.checklist : checklistValue,
        hasUnresolvedDependencies: requestedDependencies
          ? requestedDependencies.some(({ workflowState }) => workflowState !== "DONE")
          : Boolean(currentTask.dependencies?.length),
        hasIncompleteChildren: currentTask.children.some(
          (child) => child.workflowState !== "DONE" && child.workflowState !== "CANCELED",
        ),
      },
    });
    const workflowStateValue = lifecycle.workflowState;
    const statusValue = lifecycle.status;
    if (workflowStateValue !== currentTask.workflowState) data.workflowState = workflowStateValue;
    logger.debug("TASK_UPDATE narrowed", {
      statusValue,
      workflowStateValue,
      typeValue: data.type ?? null,
    });

    const effectiveType = (body.type ?? currentTask.type) as "EPIC" | "PBI" | "TASK";
    const hierarchyViolation = findTaskHierarchyViolation({
      type: effectiveType,
      parentType: currentTask.parent?.type,
      childTypes: currentTask.children.map(({ type }) => type),
    });
    if (hierarchyViolation && body.parentId === undefined) throw badRequest(hierarchyViolation);
    if (lifecycle.violation) throw badRequest(lifecycle.violation);

    if (
      (body.title !== undefined || body.description !== undefined || body.points !== undefined) &&
      (currentTask.automationStatus === "PREPARED" ||
        currentTask.automationStatus === "SPLIT_REJECTED")
    ) {
      data.automationStatus = "NONE";
      data.automationState = projectLegacyAutomationState({
        automationStatus: "NONE",
        hierarchyRole: currentTask.hierarchyRole,
      });
    }

    // Batch the assignee/parent validation and the sprint capacity read.
    const needsAssigneeCheck = body.assigneeId !== undefined && body.assigneeId;
    const needsParentCheck = body.parentId !== undefined && body.parentId && body.parentId !== id;
    const willBeInSprint = statusValue === TASK_STATUS.SPRINT;
    const needsSprintCheck = willBeInSprint && currentTask.sprint?.status !== "ACTIVE";

    const [memberResult, parentResult, capacity] = await Promise.all([
      needsAssigneeCheck
        ? tx.workspaceMember.findUnique({
            where: { workspaceId_userId: { workspaceId, userId: String(body.assigneeId) } },
            select: { userId: true },
          })
        : Promise.resolve(null),
      needsParentCheck
        ? tx.task.findFirst({
            where: { id: String(body.parentId), workspaceId },
            select: {
              id: true,
              type: true,
              workflowState: true,
              sprint: { select: { status: true } },
            },
          })
        : Promise.resolve(null),
      needsSprintCheck
        ? checkSprintCapacity(tx, {
            workspaceId,
            additionalPoints:
              typeof data.points === "number" ? data.points : (currentTask.points ?? 0),
          })
        : Promise.resolve(null),
    ]);

    if (body.assigneeId !== undefined) {
      if (body.assigneeId && !memberResult) {
        throw badRequest("assignee must be a workspace member");
      }
      data.assigneeId = body.assigneeId && memberResult ? String(body.assigneeId) : null;
    }

    if (body.parentId !== undefined) {
      if (body.parentId && body.parentId !== id && !parentResult) {
        throw badRequest("parent task not found in workspace");
      }
      data.parentId =
        body.parentId && body.parentId !== id && parentResult ? parentResult.id : null;
    }

    const effectiveParentType =
      body.parentId !== undefined ? parentResult?.type : currentTask.parent?.type;
    const proposedHierarchyViolation = findTaskHierarchyViolation({
      type: effectiveType,
      parentType: effectiveParentType,
      childTypes: currentTask.children.map(({ type }) => type),
    });
    if (proposedHierarchyViolation) throw badRequest(proposedHierarchyViolation);
    if (
      parentResult &&
      deriveLegacyStatus({
        workflowState: parentResult.workflowState,
        isInActiveSprint: parentResult.sprint?.status === "ACTIVE",
      }) === TASK_STATUS.SPRINT
    ) {
      throw badRequest("remove a parent from the sprint before adding child work items");
    }
    if (statusValue === TASK_STATUS.SPRINT && currentTask.children.length > 0) {
      throw badRequest("only leaf work items can be committed to a sprint");
    }

    if (needsSprintCheck) {
      if (!capacity?.activeSprint) {
        throw badRequest("active sprint not found");
      }
      if (capacity.exceeded) {
        throw badRequest("sprint capacity exceeded");
      }
    }

    if (statusValue === TASK_STATUS.SPRINT && capacity?.activeSprint) {
      data.sprintId = capacity.activeSprint.id;
    }
    if (statusValue === TASK_STATUS.BACKLOG || workflowStateValue === "CANCELED") {
      data.sprintId = null;
    }

    if (
      requestedDependencyIds &&
      (await taskDependencyWouldCycle(tx, {
        taskId: id,
        workspaceId,
        dependencyIds: requestedDependencyIds,
      }))
    ) {
      throw badRequest("task dependencies cannot contain a cycle");
    }
    if (
      body.parentId !== undefined &&
      (await taskParentWouldCycle(tx, {
        taskId: id,
        workspaceId,
        parentId: body.parentId ? String(body.parentId) : null,
      }))
    ) {
      throw badRequest("task hierarchy cannot contain a cycle");
    }
    const updated = await tx.task.updateMany({ where: { id, workspaceId }, data });
    if (!updated.count) {
      throw new Error("TASK_NOT_FOUND");
    }

    const updatedTask = await tx.task.findFirst({
      where: { id, workspaceId },
      include: {
        routineRule: { select: { nextAt: true, cadence: true, seriesId: true } },
      },
    });

    if (Array.isArray(body.dependencyIds)) {
      await syncTaskDependencies(tx, {
        taskId: id,
        workspaceId,
        actorId: userId,
        dependencyIds: requestedDependencyIds ?? [],
      });
    }

    if (updatedTask) {
      await syncRoutineRule(tx, {
        task: updatedTask,
        cadenceValue,
        routineNextAt,
        shouldClearRoutine,
      });
      if (statusValue === TASK_STATUS.SPRINT && updatedTask.sprintId) {
        await commitTaskToSprint(tx, {
          sprintId: updatedTask.sprintId,
          task: updatedTask,
        });
      } else if (statusValue === TASK_STATUS.BACKLOG || workflowStateValue === "CANCELED") {
        await removeTaskFromActiveSprint(tx, { taskId: updatedTask.id });
      }
      if (workflowStateValue === "DONE" && updatedTask.sprintId) {
        await completeTaskCommitment(tx, {
          taskId: updatedTask.id,
          sprintId: updatedTask.sprintId,
        });
      }
      await recordWorkflowTransition(tx, {
        taskId: updatedTask.id,
        workspaceId,
        actorId: userId,
        fromState: currentTask.workflowState,
        toState: workflowStateValue,
        trigger: "API",
      });
    }

    await tx.auditLog.create({
      data: {
        actorId: userId,
        action: "TASK_UPDATE",
        targetWorkspaceId: workspaceId,
        metadata: { taskId: id },
      },
    });

    if (updatedTask && currentStatus !== statusValue) {
      await recordTaskStatusTransition(tx, {
        taskId: updatedTask.id,
        taskTitle: updatedTask.title,
        fromStatus: currentStatus,
        toStatus: statusValue,
        actorId: userId,
        trigger: "API",
        workspaceId,
      });
    }

    const newRoutineTask =
      updatedTask &&
      workflowStateValue === "DONE" &&
      currentTask.workflowState !== "DONE" &&
      updatedTask.routineRule != null
        ? await createNextRoutineOccurrence(tx, { task: updatedTask, userId, workspaceId })
        : null;

    if (newRoutineTask) {
      await enqueueTaskAutomation(tx, {
        task: newRoutineTask,
        workspaceId,
        requestedById: userId,
      });
    }
    if (updatedTask) {
      await enqueueTaskAutomation(tx, {
        task: updatedTask,
        workspaceId,
        requestedById: userId,
      });
    }

    return { task: updatedTask ? { ...updatedTask, status: statusValue } : null };
  });

  if (!task) {
    throw notFound();
  }

  wakeTaskAutomationWorker();
  return task;
}

/** Delete a task with its dependency edges and AI suggestions. Throws if absent. */
export async function deleteTask(actor: TaskActor, id: string): Promise<void> {
  const { userId, workspaceId } = actor;
  await prisma.$transaction(async (tx) => {
    const task = await tx.task.findFirst({
      where: { id, workspaceId },
      select: {
        id: true,
        workflowState: true,
        routineRule: { select: { seriesId: true } },
      },
    });
    if (!task) throw notFound();
    if (task.workflowState !== "DONE" && task.workflowState !== "CANCELED") {
      await recordWorkflowTransition(tx, {
        taskId: task.id,
        workspaceId,
        actorId: userId,
        fromState: task.workflowState,
        toState: "CANCELED",
        trigger: "API",
      });
    }
    // Relations are ON DELETE CASCADE. Scope and delete the aggregate root
    // first so a foreign-workspace id cannot mutate any related records.
    await deactivateRoutineSeriesForDeletedTask(tx, task);
    await removeTaskFromActiveSprint(tx, { taskId: id });
    const deleted = await tx.task.deleteMany({ where: { id, workspaceId } });
    if (!deleted.count) throw notFound();
    await tx.auditLog.create({
      data: {
        actorId: userId,
        action: "TASK_DELETE",
        targetWorkspaceId: workspaceId,
        metadata: { taskId: id },
      },
    });
  });
}
