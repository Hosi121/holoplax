import type { Task, TaskStatus, TaskType } from "@prisma/client";
import { randomUUID } from "crypto";
import type { z } from "zod";
import { normalizeSeverity } from "../ai-normalization";
import { logAudit } from "../audit";
import { applyAutomationForTask } from "../automation";
import type { TaskCreateSchema, TaskUpdateSchema } from "../contracts/task";
import { AppError, HTTP_STATUS } from "../http/errors";
import { logger } from "../logger";
import { badPoints } from "../points";
import prisma from "../prisma";
import { TASK_STATUS, TASK_TYPE } from "../types";
import { checkSprintCapacity, findActiveSprint } from "./sprint-capacity";
import {
  createNextRoutineOccurrence,
  nextRoutineAt,
  syncRoutineRule,
  syncTaskDependencies,
  toNullableJsonInput,
} from "./task-write";

export type TaskCreateInput = z.infer<typeof TaskCreateSchema>;
export type TaskUpdateInput = z.infer<typeof TaskUpdateSchema>;

// Domain failures surface as AppError so withApiHandler maps them to the same
// HTTP envelope the handlers used to build with createDomainErrors("TASK").
const badRequest = (message: string) =>
  new AppError("TASK_BAD_REQUEST", message, HTTP_STATUS.BAD_REQUEST);
const notFound = (message = "not found") =>
  new AppError("TASK_NOT_FOUND", message, HTTP_STATUS.NOT_FOUND);

export const isTaskStatus = (value: unknown): value is TaskStatus =>
  Object.values(TASK_STATUS).includes(value as TaskStatus);

export const isTaskType = (value: unknown): value is TaskType =>
  Object.values(TASK_TYPE).includes(value as TaskType);

export const isSeverity = (value: unknown): value is "LOW" | "MEDIUM" | "HIGH" =>
  ["LOW", "MEDIUM", "HIGH"].includes(value as string);

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
export async function createTask(params: {
  userId: string;
  workspaceId: string;
  input: TaskCreateInput;
}): Promise<Task> {
  const { userId, workspaceId, input } = params;
  const {
    title,
    description,
    definitionOfDone,
    checklist,
    points,
    urgency,
    risk,
    status,
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
  if (badPoints(points)) {
    throw badRequest("points must be one of 1,2,3,5,8,13,21,34");
  }
  let safeAssigneeId: string | null = assigneeId ?? null;
  if (safeAssigneeId) {
    const member = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: safeAssigneeId } },
      select: { userId: true },
    });
    if (!member) {
      safeAssigneeId = null;
    }
  }
  const dependencyList = Array.isArray(dependencyIds)
    ? dependencyIds.map((id: string) => String(id))
    : [];
  const allowedDependencies = dependencyList.length
    ? await prisma.task.findMany({
        where: { id: { in: dependencyList }, workspaceId },
        select: { id: true, title: true, status: true },
      })
    : [];
  const statusValue = isTaskStatus(status) ? status : TASK_STATUS.BACKLOG;
  const typeValue = isTaskType(type) ? type : TASK_TYPE.PBI;
  logger.debug("TASK_CREATE narrowed", { statusValue, typeValue });
  const parentCandidate = parentId ? String(parentId) : null;
  const parent = parentCandidate
    ? await prisma.task.findFirst({
        where: { id: parentCandidate, workspaceId },
        select: { id: true },
      })
    : null;
  if (
    statusValue !== TASK_STATUS.BACKLOG &&
    allowedDependencies.some((dep) => dep.status !== TASK_STATUS.DONE)
  ) {
    throw badRequest("dependencies must be done before moving to sprint");
  }
  const activeSprint =
    statusValue === TASK_STATUS.SPRINT ? await findActiveSprint(prisma, workspaceId) : null;
  if (activeSprint) {
    const { exceeded } = await checkSprintCapacity(prisma, {
      workspaceId,
      additionalPoints: Number(points),
      activeSprint,
    });
    if (exceeded) {
      throw badRequest("sprint capacity exceeded");
    }
  }
  const task = await prisma.task.create({
    data: {
      title,
      description: description ?? "",
      definitionOfDone: typeof definitionOfDone === "string" ? definitionOfDone : "",
      checklist: toNullableJsonInput(toChecklistForCreate(checklist)),
      points: Number(points),
      urgency: normalizeSeverity(urgency),
      risk: normalizeSeverity(risk),
      status: statusValue,
      dueDate: dueDate ? new Date(dueDate) : null,
      tags: Array.isArray(tags) ? tags.map((tag: string) => String(tag)) : [],
      type: typeValue,
      sprint: activeSprint ? { connect: { id: activeSprint.id } } : undefined,
      parent: parent ? { connect: { id: parent.id } } : undefined,
      assignee: safeAssigneeId ? { connect: { id: safeAssigneeId } } : undefined,
      user: { connect: { id: userId } },
      workspace: { connect: { id: workspaceId } },
    },
  });
  const cadenceValue =
    routineCadence === "DAILY" || routineCadence === "WEEKLY" ? routineCadence : null;
  // A task is recurring iff it carries a cadence — independent of its type.
  if (cadenceValue) {
    const baseDate = dueDate ? new Date(dueDate) : new Date();
    const nextAt = routineNextAt ? new Date(routineNextAt) : nextRoutineAt(cadenceValue, baseDate);
    await prisma.routineRule.create({
      data: { taskId: task.id, cadence: cadenceValue, nextAt },
    });
  }
  if (allowedDependencies.length > 0) {
    await prisma.taskDependency.createMany({
      data: dependencyList
        .filter((id: string) => id && id !== task.id)
        .filter((id: string) => allowedDependencies.some((allowed) => allowed.id === id))
        .map((id: string) => ({ taskId: task.id, dependsOnId: id })),
      skipDuplicates: true,
    });
  }
  await prisma.taskStatusEvent.create({
    data: {
      taskId: task.id,
      fromStatus: null,
      toStatus: task.status,
      actorId: userId,
      trigger: "API",
      workspaceId,
    },
  });
  await logAudit({
    actorId: userId,
    action: "TASK_CREATE",
    targetWorkspaceId: workspaceId,
    metadata: { taskId: task.id, status: task.status },
  });
  await applyAutomationForTask({
    userId,
    workspaceId,
    task: {
      id: task.id,
      title: task.title,
      description: task.description ?? "",
      points: task.points,
      status: task.status,
    },
  });
  return task;
}

/**
 * Apply a partial update to a task within a single transaction (field changes,
 * dependency/routine reconciliation, audit, status event, and routine-completion
 * cloning), then run automation. Throws on a missing task or invalid transition.
 */
export async function updateTask(params: {
  userId: string;
  workspaceId: string;
  taskId: string;
  input: TaskUpdateInput;
}): Promise<Task> {
  const { userId, workspaceId, taskId: id, input: body } = params;
  logger.debug("TASK_UPDATE input", {
    id,
    status: body.status,
    type: body.type,
    checklistType: Array.isArray(body.checklist) ? "array" : typeof body.checklist,
    checklistNull: body.checklist === null,
  });
  const data: Record<string, unknown> = {};

  if (body.title) data.title = body.title;
  if (typeof body.description === "string") data.description = body.description;
  if (typeof body.definitionOfDone === "string") {
    data.definitionOfDone = body.definitionOfDone;
  }
  const checklistValue = toChecklistForUpdate(body.checklist);
  if (checklistValue !== undefined) {
    data.checklist = checklistValue;
  }
  // points is already a valid Fibonacci number (TaskPointsSchema validated at parse time)
  if (body.points !== undefined && body.points !== null) {
    data.points = body.points;
  }
  if (body.urgency) data.urgency = body.urgency;
  if (body.risk) data.risk = body.risk;
  // type is already a valid TaskType (TaskTypeSchema validated at parse time)
  if (body.type !== undefined) {
    data.type = body.type;
  }
  // automationState is intentionally not writable by users.
  // It is managed exclusively by the server-side automation engine.
  if (body.dueDate !== undefined) {
    data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
  }
  if (body.tags !== undefined) {
    data.tags = Array.isArray(body.tags) ? body.tags.map((tag: string) => String(tag)) : [];
  }
  // status is already a valid TaskStatus (validated at parse time); the cast
  // bridges z.preprocess()'s string output to the narrower union.
  const statusValue = (body.status as TaskStatus | undefined) ?? null;
  logger.debug("TASK_UPDATE narrowed", { statusValue, typeValue: data.type ?? null });
  if (statusValue) {
    data.status = statusValue;
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

  // Fetch task with related data in a single query.
  const currentTask = await prisma.task.findFirst({
    where: { id, workspaceId },
    include: {
      routineRule: true,
      dependencies:
        statusValue === TASK_STATUS.SPRINT || statusValue === TASK_STATUS.DONE
          ? {
              where: { dependsOn: { status: { not: TASK_STATUS.DONE } } },
              select: { dependsOn: { select: { id: true, title: true, status: true } } },
            }
          : false,
    },
  });
  if (!currentTask) {
    throw notFound();
  }

  if (
    (statusValue === TASK_STATUS.SPRINT || statusValue === TASK_STATUS.DONE) &&
    currentTask.dependencies &&
    currentTask.dependencies.length > 0
  ) {
    throw badRequest("dependencies must be done before moving");
  }

  // Batch the assignee/parent validation and the sprint capacity read.
  const needsAssigneeCheck = body.assigneeId !== undefined && body.assigneeId;
  const needsParentCheck = body.parentId !== undefined && body.parentId && body.parentId !== id;
  const needsSprintCheck = statusValue === TASK_STATUS.SPRINT;

  const [memberResult, parentResult, capacity] = await Promise.all([
    needsAssigneeCheck
      ? prisma.workspaceMember.findUnique({
          where: { workspaceId_userId: { workspaceId, userId: String(body.assigneeId) } },
          select: { userId: true },
        })
      : Promise.resolve(null),
    needsParentCheck
      ? prisma.task.findFirst({
          where: { id: String(body.parentId), workspaceId },
          select: { id: true },
        })
      : Promise.resolve(null),
    needsSprintCheck
      ? checkSprintCapacity(prisma, {
          workspaceId,
          additionalPoints:
            typeof data.points === "number" ? data.points : (currentTask.points ?? 0),
          excludeTaskIds: [id],
        })
      : Promise.resolve(null),
  ]);

  if (body.assigneeId !== undefined) {
    data.assigneeId = body.assigneeId && memberResult ? String(body.assigneeId) : null;
  }

  if (body.parentId !== undefined) {
    data.parentId = body.parentId && body.parentId !== id && parentResult ? parentResult.id : null;
  }

  if (statusValue === TASK_STATUS.SPRINT) {
    if (!capacity?.activeSprint) {
      throw badRequest("active sprint not found");
    }
    if (capacity.exceeded) {
      throw badRequest("sprint capacity exceeded");
    }
    data.sprintId = capacity.activeSprint.id;
  }
  if (statusValue === TASK_STATUS.BACKLOG) {
    data.sprintId = null;
  }

  const { task, createdRoutineTask } = await prisma.$transaction(async (tx) => {
    const updated = await tx.task.updateMany({ where: { id, workspaceId }, data });
    if (!updated.count) {
      throw new Error("TASK_NOT_FOUND");
    }

    const updatedTask = await tx.task.findFirst({
      where: { id, workspaceId },
      include: { routineRule: { select: { nextAt: true, cadence: true } } },
    });

    if (Array.isArray(body.dependencyIds)) {
      await syncTaskDependencies(tx, {
        taskId: id,
        workspaceId,
        dependencyIds: body.dependencyIds.map((depId: string) => String(depId)),
      });
    }

    if (updatedTask) {
      await syncRoutineRule(tx, {
        task: updatedTask,
        cadenceValue,
        routineNextAt,
        shouldClearRoutine,
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

    if (updatedTask && statusValue && currentTask.status !== statusValue) {
      await tx.taskStatusEvent.create({
        data: {
          taskId: updatedTask.id,
          fromStatus: currentTask.status ?? null,
          toStatus: statusValue,
          actorId: userId,
          trigger: "API",
          workspaceId,
        },
      });
    }

    const newRoutineTask =
      updatedTask &&
      statusValue === TASK_STATUS.DONE &&
      currentTask.status !== TASK_STATUS.DONE &&
      updatedTask.routineRule != null
        ? await createNextRoutineOccurrence(tx, { task: updatedTask, userId, workspaceId })
        : null;

    return { task: updatedTask, createdRoutineTask: newRoutineTask };
  });

  if (!task) {
    throw notFound();
  }

  // Automation runs outside the transaction (may have side effects).
  if (createdRoutineTask) {
    await applyAutomationForTask({
      userId,
      workspaceId,
      task: {
        id: createdRoutineTask.id,
        title: createdRoutineTask.title,
        description: createdRoutineTask.description ?? "",
        points: createdRoutineTask.points,
        status: createdRoutineTask.status,
      },
    });
  }
  await applyAutomationForTask({
    userId,
    workspaceId,
    task: {
      id: task.id,
      title: task.title,
      description: task.description ?? "",
      points: task.points,
      status: task.status,
    },
  });

  return task;
}

/** Delete a task with its dependency edges and AI suggestions. Throws if absent. */
export async function deleteTask(params: {
  userId: string;
  workspaceId: string;
  taskId: string;
}): Promise<void> {
  const { userId, workspaceId, taskId: id } = params;
  await prisma.taskDependency.deleteMany({ where: { taskId: id } });
  await prisma.aiSuggestion.deleteMany({ where: { taskId: id } });
  const deleted = await prisma.task.deleteMany({ where: { id, workspaceId } });
  if (!deleted.count) {
    throw notFound();
  }
  await logAudit({
    actorId: userId,
    action: "TASK_DELETE",
    targetWorkspaceId: workspaceId,
    metadata: { taskId: id },
  });
}
