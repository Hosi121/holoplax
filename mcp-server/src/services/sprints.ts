import type { ExecutionContext } from "../context.js";
import prisma from "../prisma.js";

// Type definitions matching Prisma schema
type TaskStatus = "BACKLOG" | "SPRINT" | "DONE";
type SprintStatus = "ACTIVE" | "CLOSED";

const TASK_STATUS = {
  BACKLOG: "BACKLOG",
  SPRINT: "SPRINT",
  DONE: "DONE",
} as const;

function defaultSprintName(): string {
  const today = new Date().toISOString().slice(0, 10);
  return `Sprint-${today}`;
}

interface SprintWithTasks {
  id: string;
  name: string;
  status: SprintStatus;
  capacityPoints: number;
  startedAt: Date;
  plannedEndAt: Date | null;
  endedAt: Date | null;
  userId: string;
  workspaceId: string;
  tasks: Array<{ status: TaskStatus; points: number }>;
}

export async function listSprints(ctx: ExecutionContext, status?: string) {
  const { workspaceId } = ctx;

  const where: Record<string, unknown> = { workspaceId };
  if (status === "ACTIVE" || status === "CLOSED") {
    where.status = status;
  }

  const sprints = (await prisma.sprint.findMany({
    where,
    orderBy: { startedAt: "desc" },
    include: {
      tasks: {
        select: { status: true, points: true },
      },
    },
  })) as SprintWithTasks[];

  return sprints.map(({ tasks, ...sprint }) => {
    let committed = 0;
    let completed = 0;
    for (const task of tasks) {
      committed += task.points;
      if (task.status === TASK_STATUS.DONE) completed += task.points;
    }
    return {
      ...sprint,
      committedPoints: committed,
      completedPoints: completed,
    };
  });
}

export async function getCurrentSprint(ctx: ExecutionContext) {
  const { workspaceId } = ctx;

  const sprint = (await prisma.sprint.findFirst({
    where: { workspaceId, status: "ACTIVE" },
    orderBy: { startedAt: "desc" },
    include: {
      tasks: {
        select: { status: true, points: true },
      },
    },
  })) as SprintWithTasks | null;

  if (!sprint) {
    return null;
  }

  const { tasks, ...rest } = sprint;
  let committed = 0;
  let completed = 0;
  for (const task of tasks) {
    committed += task.points;
    if (task.status === TASK_STATUS.DONE) completed += task.points;
  }

  return {
    ...rest,
    committedPoints: committed,
    completedPoints: completed,
  };
}

export interface CreateSprintInput {
  name?: string;
  capacityPoints?: number;
  plannedEndAt?: string;
}

export async function createSprint(ctx: ExecutionContext, input: CreateSprintInput = {}) {
  const { workspaceId, userId } = ctx;

  const name = input.name?.trim() || defaultSprintName();
  const capacityPoints = input.capacityPoints ?? 24;
  const plannedEndAt = input.plannedEndAt ? new Date(input.plannedEndAt) : null;

  if (!Number.isFinite(capacityPoints) || capacityPoints <= 0) {
    throw new Error("capacityPoints must be positive");
  }

  // Close any existing active sprints
  await prisma.sprint.updateMany({
    where: { workspaceId, status: "ACTIVE" },
    data: { status: "CLOSED", endedAt: new Date() },
  });

  // Create new sprint
  const sprint = await prisma.sprint.create({
    data: {
      name,
      capacityPoints,
      userId,
      workspaceId,
      plannedEndAt,
    },
    select: {
      id: true,
      name: true,
      status: true,
      capacityPoints: true,
      startedAt: true,
      plannedEndAt: true,
      endedAt: true,
    },
  });

  // Assign any existing SPRINT status tasks to this sprint
  await prisma.task.updateMany({
    where: { workspaceId, status: TASK_STATUS.SPRINT },
    data: { sprintId: sprint.id },
  });

  await prisma.auditLog.create({
    data: {
      actorId: userId,
      action: "SPRINT_START",
      targetWorkspaceId: workspaceId,
      metadata: { sprintId: sprint.id, name: sprint.name, source: "mcp" },
    },
  });

  return sprint;
}

export async function closeSprint(ctx: ExecutionContext) {
  const { workspaceId, userId } = ctx;

  const sprint = await prisma.sprint.findFirst({
    where: { workspaceId, status: "ACTIVE" },
    orderBy: { startedAt: "desc" },
    select: { id: true },
  });

  if (!sprint) {
    throw new Error("active sprint not found");
  }

  const updated = await prisma.sprint.update({
    where: { id: sprint.id },
    data: { status: "CLOSED", endedAt: new Date() },
    select: {
      id: true,
      name: true,
      status: true,
      capacityPoints: true,
      startedAt: true,
      plannedEndAt: true,
      endedAt: true,
    },
  });

  // Calculate completed points
  const doneTasks = await prisma.task.findMany({
    where: { sprintId: sprint.id, status: TASK_STATUS.DONE },
    select: { points: true },
  });
  const completedPoints = doneTasks.reduce(
    (sum: number, task: { points: number }) => sum + task.points,
    0,
  );
  const rangeMin = Math.max(0, completedPoints - 2);
  const rangeMax = completedPoints + 2;

  // Create velocity entry
  await prisma.velocityEntry.create({
    data: {
      name: updated.name,
      points: completedPoints,
      range: `${rangeMin}-${rangeMax}`,
      userId,
      workspaceId,
    },
  });

  // Move remaining SPRINT tasks back to BACKLOG
  const sprintTasks = await prisma.task.findMany({
    where: { workspaceId, status: TASK_STATUS.SPRINT },
    select: { id: true },
  });

  await prisma.task.updateMany({
    where: { workspaceId, status: TASK_STATUS.SPRINT },
    data: { status: TASK_STATUS.BACKLOG, sprintId: null },
  });

  if (sprintTasks.length) {
    await prisma.taskStatusEvent.createMany({
      data: sprintTasks.map((task: { id: string }) => ({
        taskId: task.id,
        fromStatus: TASK_STATUS.SPRINT,
        toStatus: TASK_STATUS.BACKLOG,
        actorId: userId,
        source: "SPRINT_END",
        workspaceId,
      })),
    });
  }

  await prisma.auditLog.create({
    data: {
      actorId: userId,
      action: "SPRINT_END",
      targetWorkspaceId: workspaceId,
      metadata: {
        sprintId: updated.id,
        completedPoints,
        source: "mcp",
      },
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: userId,
      action: "VELOCITY_AUTO_CREATE",
      targetWorkspaceId: workspaceId,
      metadata: {
        sprintId: updated.id,
        points: completedPoints,
        range: `${rangeMin}-${rangeMax}`,
        source: "mcp",
      },
    },
  });

  return updated;
}
