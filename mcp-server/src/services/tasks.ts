import { PrismaClient } from "@prisma/client";
import type { ExecutionContext } from "../context.js";

const prisma = new PrismaClient();

// Type definitions matching Prisma schema
type TaskStatus = "BACKLOG" | "SPRINT" | "DONE";
type TaskType = "EPIC" | "PBI" | "TASK" | "ROUTINE";
type Severity = "LOW" | "MEDIUM" | "HIGH";

const TASK_STATUS = {
  BACKLOG: "BACKLOG",
  SPRINT: "SPRINT",
  DONE: "DONE",
} as const;

const TASK_TYPE = {
  EPIC: "EPIC",
  PBI: "PBI",
  TASK: "TASK",
  ROUTINE: "ROUTINE",
} as const;

const SEVERITY = {
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
} as const;

const VALID_POINTS = [1, 2, 3, 5, 8, 13, 21, 34] as const;

function isValidPoints(value: number): boolean {
  return VALID_POINTS.includes(value as (typeof VALID_POINTS)[number]);
}

function isTaskStatus(value: unknown): value is TaskStatus {
  return Object.values(TASK_STATUS).includes(value as TaskStatus);
}

function isTaskType(value: unknown): value is TaskType {
  return Object.values(TASK_TYPE).includes(value as TaskType);
}

function isSeverity(value: unknown): value is Severity {
  return Object.values(SEVERITY).includes(value as Severity);
}

export interface TaskFilters {
  status?: string[];
  type?: string[];
  urgency?: string;
  risk?: string;
  tags?: string[];
  assigneeId?: string;
  dueBefore?: string;
  dueAfter?: string;
  minPoints?: number;
  maxPoints?: number;
  search?: string;
  limit?: number;
  cursor?: string;
}

export async function listTasks(ctx: ExecutionContext, filters: TaskFilters = {}) {
  const { workspaceId } = ctx;
  const take = Math.min(500, Math.max(10, filters.limit ?? 200));

  // Build where clause dynamically
  const where: Record<string, unknown> = { workspaceId };

  if (filters.status?.length) {
    const validStatuses = filters.status.filter(isTaskStatus);
    if (validStatuses.length) {
      where.status = { in: validStatuses };
    }
  }
  if (filters.type?.length) {
    const validTypes = filters.type.filter(isTaskType);
    if (validTypes.length) {
      where.type = { in: validTypes };
    }
  }
  if (filters.urgency && isSeverity(filters.urgency)) {
    where.urgency = filters.urgency;
  }
  if (filters.risk && isSeverity(filters.risk)) {
    where.risk = filters.risk;
  }
  if (filters.assigneeId) {
    where.assigneeId = filters.assigneeId;
  }
  if (filters.tags?.length) {
    where.tags = { hasSome: filters.tags };
  }
  if (filters.dueBefore || filters.dueAfter) {
    const dateFilter: Record<string, Date> = {};
    if (filters.dueBefore) dateFilter.lte = new Date(filters.dueBefore);
    if (filters.dueAfter) dateFilter.gte = new Date(filters.dueAfter);
    where.dueDate = dateFilter;
  }
  if (filters.minPoints && Number.isFinite(filters.minPoints)) {
    where.points = { gte: filters.minPoints };
  }
  if (filters.maxPoints && Number.isFinite(filters.maxPoints)) {
    const pointsFilter: Record<string, number> = { lte: filters.maxPoints };
    if (filters.minPoints) pointsFilter.gte = filters.minPoints;
    where.points = pointsFilter;
  }
  if (filters.search) {
    where.OR = [
      { title: { contains: filters.search, mode: "insensitive" } },
      { description: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  if (filters.cursor) {
    const tasks = await prisma.task.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: take + 1,
      cursor: { id: filters.cursor },
      skip: 1,
      include: {
        routineRule: { select: { cadence: true, nextAt: true } },
        dependencies: {
          select: {
            dependsOnId: true,
            dependsOn: { select: { id: true, title: true, status: true } },
          },
        },
      },
    });

    const hasMore = tasks.length > take;
    const results = hasMore ? tasks.slice(0, take) : tasks;
    const nextCursor = hasMore ? results[results.length - 1]?.id : null;

    return { tasks: results, nextCursor, hasMore };
  }

  const tasks = await prisma.task.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: take + 1,
    include: {
      routineRule: { select: { cadence: true, nextAt: true } },
      dependencies: {
        select: {
          dependsOnId: true,
          dependsOn: { select: { id: true, title: true, status: true } },
        },
      },
    },
  });

  const hasMore = tasks.length > take;
  const results = hasMore ? tasks.slice(0, take) : tasks;
  const nextCursor = hasMore ? results[results.length - 1]?.id : null;

  return { tasks: results, nextCursor, hasMore };
}

export async function getTask(ctx: ExecutionContext, taskId: string) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, workspaceId: ctx.workspaceId },
    include: {
      routineRule: { select: { cadence: true, nextAt: true } },
      dependencies: {
        select: {
          dependsOnId: true,
          dependsOn: { select: { id: true, title: true, status: true } },
        },
      },
    },
  });

  if (!task) {
    throw new Error("Task not found");
  }

  return task;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  definitionOfDone?: string;
  points: number;
  urgency?: string;
  risk?: string;
  status?: string;
  type?: string;
  parentId?: string;
  dueDate?: string;
  assigneeId?: string;
  tags?: string[];
  dependencyIds?: string[];
}

export async function createTask(ctx: ExecutionContext, input: CreateTaskInput) {
  const { workspaceId, userId } = ctx;

  if (!isValidPoints(input.points)) {
    throw new Error("points must be one of 1,2,3,5,8,13,21,34");
  }

  const statusValue: TaskStatus = isTaskStatus(input.status) ? input.status : TASK_STATUS.BACKLOG;
  const typeValue: TaskType = isTaskType(input.type) ? input.type : TASK_TYPE.PBI;
  const urgencyValue: Severity = isSeverity(input.urgency) ? input.urgency : SEVERITY.MEDIUM;
  const riskValue: Severity = isSeverity(input.risk) ? input.risk : SEVERITY.MEDIUM;

  let safeAssigneeId: string | null = input.assigneeId ?? null;
  if (safeAssigneeId) {
    const member = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: safeAssigneeId } },
      select: { userId: true },
    });
    if (!member) {
      safeAssigneeId = null;
    }
  }

  const dependencyList = Array.isArray(input.dependencyIds) ? input.dependencyIds.map(String) : [];
  const allowedDependencies = dependencyList.length
    ? await prisma.task.findMany({
        where: { id: { in: dependencyList }, workspaceId },
        select: { id: true, title: true, status: true },
      })
    : [];

  const parent = input.parentId
    ? await prisma.task.findFirst({
        where: { id: input.parentId, workspaceId },
        select: { id: true },
      })
    : null;

  if (
    statusValue !== TASK_STATUS.BACKLOG &&
    allowedDependencies.some(
      (dep: { id: string; title: string; status: string }) => dep.status !== TASK_STATUS.DONE,
    )
  ) {
    throw new Error("dependencies must be done before moving to sprint");
  }

  const activeSprint =
    statusValue === TASK_STATUS.SPRINT
      ? await prisma.sprint.findFirst({
          where: { workspaceId, status: "ACTIVE" },
          orderBy: { startedAt: "desc" },
          select: { id: true, capacityPoints: true },
        })
      : null;

  if (statusValue === TASK_STATUS.SPRINT && activeSprint) {
    const current = await prisma.task.aggregate({
      where: { workspaceId, status: TASK_STATUS.SPRINT },
      _sum: { points: true },
    });
    const nextTotal = (current._sum.points ?? 0) + input.points;
    if (nextTotal > activeSprint.capacityPoints) {
      throw new Error("sprint capacity exceeded");
    }
  }

  const task = await prisma.task.create({
    data: {
      title: input.title,
      description: input.description ?? "",
      definitionOfDone: input.definitionOfDone ?? "",
      points: input.points,
      urgency: urgencyValue,
      risk: riskValue,
      status: statusValue,
      type: typeValue,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      tags: input.tags ?? [],
      sprint: activeSprint ? { connect: { id: activeSprint.id } } : undefined,
      parent: parent ? { connect: { id: parent.id } } : undefined,
      assignee: safeAssigneeId ? { connect: { id: safeAssigneeId } } : undefined,
      user: { connect: { id: userId } },
      workspace: { connect: { id: workspaceId } },
    },
  });

  if (allowedDependencies.length > 0) {
    await prisma.taskDependency.createMany({
      data: dependencyList
        .filter((id) => id && id !== task.id)
        .filter((id) => allowedDependencies.some((allowed: { id: string }) => allowed.id === id))
        .map((id) => ({
          taskId: task.id,
          dependsOnId: id,
        })),
      skipDuplicates: true,
    });
  }

  await prisma.taskStatusEvent.create({
    data: {
      taskId: task.id,
      fromStatus: null,
      toStatus: task.status,
      actorId: userId,
      source: "mcp",
      workspaceId,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: userId,
      action: "TASK_CREATE",
      targetWorkspaceId: workspaceId,
      metadata: { taskId: task.id, status: task.status, source: "mcp" },
    },
  });

  return task;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  definitionOfDone?: string;
  points?: number;
  urgency?: string;
  risk?: string;
  status?: string;
  type?: string;
  parentId?: string | null;
  dueDate?: string | null;
  assigneeId?: string | null;
  tags?: string[];
  dependencyIds?: string[];
}

export async function updateTask(ctx: ExecutionContext, taskId: string, input: UpdateTaskInput) {
  const { workspaceId, userId } = ctx;

  const currentTask = await prisma.task.findFirst({
    where: { id: taskId, workspaceId },
    include: { routineRule: true },
  });

  if (!currentTask) {
    throw new Error("Task not found");
  }

  const data: Record<string, unknown> = {};

  if (input.title !== undefined) data.title = input.title;
  if (input.description !== undefined) data.description = input.description;
  if (input.definitionOfDone !== undefined) data.definitionOfDone = input.definitionOfDone;
  if (input.points !== undefined) {
    if (!isValidPoints(input.points)) {
      throw new Error("points must be one of 1,2,3,5,8,13,21,34");
    }
    data.points = input.points;
  }
  if (input.urgency !== undefined && isSeverity(input.urgency)) {
    data.urgency = input.urgency;
  }
  if (input.risk !== undefined && isSeverity(input.risk)) {
    data.risk = input.risk;
  }
  if (input.type !== undefined) {
    data.type = isTaskType(input.type) ? input.type : TASK_TYPE.PBI;
  }
  if (input.dueDate !== undefined) {
    data.dueDate = input.dueDate ? new Date(input.dueDate) : null;
  }
  if (input.tags !== undefined) {
    data.tags = input.tags;
  }

  const statusValue: TaskStatus | null =
    input.status && isTaskStatus(input.status) ? input.status : null;
  if (statusValue) {
    data.status = statusValue;

    if (statusValue === TASK_STATUS.SPRINT || statusValue === TASK_STATUS.DONE) {
      const blocking = await prisma.taskDependency.findMany({
        where: { taskId, dependsOn: { status: { not: TASK_STATUS.DONE } } },
      });
      if (blocking.length > 0) {
        throw new Error("dependencies must be done before moving");
      }
    }

    if (statusValue === TASK_STATUS.SPRINT) {
      const activeSprint = await prisma.sprint.findFirst({
        where: { workspaceId, status: "ACTIVE" },
        orderBy: { startedAt: "desc" },
        select: { id: true, capacityPoints: true },
      });
      if (!activeSprint) {
        throw new Error("active sprint not found");
      }
      const current = await prisma.task.aggregate({
        where: { workspaceId, status: TASK_STATUS.SPRINT, id: { not: taskId } },
        _sum: { points: true },
      });
      const nextPoints =
        (current._sum.points ?? 0) +
        (typeof data.points === "number" ? data.points : currentTask.points);
      if (nextPoints > activeSprint.capacityPoints) {
        throw new Error("sprint capacity exceeded");
      }
      data.sprintId = activeSprint.id;
    }

    if (statusValue === TASK_STATUS.BACKLOG) {
      data.sprintId = null;
    }
  }

  if (input.assigneeId !== undefined) {
    if (input.assigneeId) {
      const member = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: String(input.assigneeId) } },
        select: { userId: true },
      });
      data.assigneeId = member ? input.assigneeId : null;
    } else {
      data.assigneeId = null;
    }
  }

  if (input.parentId !== undefined) {
    if (input.parentId && input.parentId !== taskId) {
      const parent = await prisma.task.findFirst({
        where: { id: input.parentId, workspaceId },
        select: { id: true },
      });
      data.parentId = parent ? parent.id : null;
    } else {
      data.parentId = null;
    }
  }

  const task = await prisma.task.update({
    where: { id: taskId },
    data,
  });

  if (Array.isArray(input.dependencyIds)) {
    const dependencyIds = input.dependencyIds.map(String);
    const allowed = dependencyIds.length
      ? await prisma.task.findMany({
          where: { id: { in: dependencyIds }, workspaceId },
          select: { id: true },
        })
      : [];
    await prisma.taskDependency.deleteMany({ where: { taskId } });
    if (allowed.length > 0) {
      await prisma.taskDependency.createMany({
        data: allowed
          .map((dep: { id: string }) => dep.id)
          .filter((depId: string) => depId && depId !== taskId)
          .map((depId: string) => ({ taskId, dependsOnId: depId })),
        skipDuplicates: true,
      });
    }
  }

  if (statusValue && currentTask.status !== statusValue) {
    await prisma.taskStatusEvent.create({
      data: {
        taskId: task.id,
        fromStatus: currentTask.status,
        toStatus: statusValue,
        actorId: userId,
        source: "mcp",
        workspaceId,
      },
    });
  }

  await prisma.auditLog.create({
    data: {
      actorId: userId,
      action: "TASK_UPDATE",
      targetWorkspaceId: workspaceId,
      metadata: { taskId, source: "mcp" },
    },
  });

  return task;
}

export async function deleteTask(ctx: ExecutionContext, taskId: string) {
  const { workspaceId, userId } = ctx;

  const task = await prisma.task.findFirst({
    where: { id: taskId, workspaceId },
    select: { id: true },
  });

  if (!task) {
    throw new Error("Task not found");
  }

  await prisma.taskDependency.deleteMany({ where: { taskId } });
  await prisma.aiSuggestion.deleteMany({ where: { taskId } });
  await prisma.task.delete({ where: { id: taskId } });

  await prisma.auditLog.create({
    data: {
      actorId: userId,
      action: "TASK_DELETE",
      targetWorkspaceId: workspaceId,
      metadata: { taskId, source: "mcp" },
    },
  });

  return { ok: true };
}
