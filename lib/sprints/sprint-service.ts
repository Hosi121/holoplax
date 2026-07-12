import { Prisma, type SprintStatus } from "@prisma/client";
import type { z } from "zod";
import { logAudit } from "../audit";
import type { SprintStartSchema, SprintUpdateSchema } from "../contracts/sprint";
import { AppError, HTTP_STATUS } from "../http/errors";
import prisma from "../prisma";
import { TASK_STATUS } from "../types";

export type SprintStartInput = z.infer<typeof SprintStartSchema>;
export type SprintUpdateInput = z.infer<typeof SprintUpdateSchema>;

const sprintSelect = {
  id: true,
  name: true,
  status: true,
  capacityPoints: true,
  startedAt: true,
  plannedEndAt: true,
  endedAt: true,
} as const;

const notFound = (message: string) =>
  new AppError("SPRINT_NOT_FOUND", message, HTTP_STATUS.NOT_FOUND);
const badRequest = (message: string) =>
  new AppError("SPRINT_BAD_REQUEST", message, HTTP_STATUS.BAD_REQUEST);
const conflict = (message: string) =>
  new AppError("SPRINT_CONFLICT", message, HTTP_STATUS.CONFLICT);

const defaultSprintName = () => `Sprint-${new Date().toISOString().slice(0, 10)}`;

const summarizeTasks = (tasks: Array<{ status: string; points: number }>) => {
  let committedPoints = 0;
  let completedPoints = 0;
  for (const task of tasks) {
    committedPoints += task.points;
    if (task.status === TASK_STATUS.DONE) completedPoints += task.points;
  }
  return { committedPoints, completedPoints };
};

export async function listSprints(
  workspaceId: string,
  options: { status?: SprintStatus; limit?: number } = {},
) {
  const take =
    options.limit !== undefined && Number.isFinite(options.limit) && options.limit > 0
      ? Math.min(Math.trunc(options.limit), 100)
      : undefined;
  const sprints = await prisma.sprint.findMany({
    where: { workspaceId, ...(options.status ? { status: options.status } : {}) },
    orderBy: { startedAt: "desc" },
    ...(take ? { take } : {}),
    select: {
      ...sprintSelect,
      tasks: { select: { status: true, points: true } },
    },
  });

  return sprints.map(({ tasks, ...sprint }) => ({
    ...sprint,
    ...summarizeTasks(tasks),
  }));
}

export async function getCurrentSprint(workspaceId: string) {
  const sprint = await prisma.sprint.findFirst({
    where: { workspaceId, status: "ACTIVE" },
    orderBy: { startedAt: "desc" },
    select: {
      ...sprintSelect,
      tasks: { select: { status: true, points: true } },
    },
  });
  if (!sprint) return null;
  const { tasks, ...current } = sprint;
  return { ...current, ...summarizeTasks(tasks) };
}

export async function createSprint(params: {
  userId: string;
  workspaceId: string;
  input?: SprintStartInput;
}) {
  const { userId, workspaceId, input = {} } = params;
  const name = input.name?.trim() || defaultSprintName();
  const capacityPoints = input.capacityPoints ?? 24;
  const plannedEndAt = input.plannedEndAt ? new Date(input.plannedEndAt) : null;

  const active = await prisma.sprint.findFirst({
    where: { workspaceId, status: "ACTIVE" },
    select: { id: true },
  });
  if (active) throw conflict("close the active sprint before starting a new one");

  const sprint = await prisma
    .$transaction(async (tx) => {
      const created = await tx.sprint.create({
        data: { name, capacityPoints, userId, workspaceId, plannedEndAt },
        select: sprintSelect,
      });
      await tx.task.updateMany({
        where: { workspaceId, status: TASK_STATUS.SPRINT },
        data: { sprintId: created.id },
      });
      return created;
    })
    .catch((error: unknown) => {
      // The partial unique index is the final guard against two concurrent
      // start requests that both observed no active sprint.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw conflict("an active sprint already exists");
      }
      throw error;
    });

  await logAudit({
    actorId: userId,
    action: "SPRINT_START",
    targetWorkspaceId: workspaceId,
    metadata: { sprintId: sprint.id, name: sprint.name },
  });
  return sprint;
}

export async function closeCurrentSprint(params: { userId: string; workspaceId: string }) {
  const { userId, workspaceId } = params;
  const active = await prisma.sprint.findFirst({
    where: { workspaceId, status: "ACTIVE" },
    orderBy: { startedAt: "desc" },
    select: { id: true },
  });
  if (!active) throw notFound("active sprint not found");

  const closed = await prisma.$transaction(async (tx) => {
    // Conditional update makes concurrent close requests idempotent at the
    // persistence boundary: only one request may produce a velocity entry.
    const claimed = await tx.sprint.updateMany({
      where: { id: active.id, workspaceId, status: "ACTIVE" },
      data: { status: "CLOSED", endedAt: new Date() },
    });
    if (!claimed.count) throw conflict("active sprint was already closed");
    const updated = await tx.sprint.findUniqueOrThrow({
      where: { id: active.id },
      select: sprintSelect,
    });
    const aggregate = await tx.task.aggregate({
      where: { sprintId: active.id, status: TASK_STATUS.DONE },
      _sum: { points: true },
    });
    const completedPoints = aggregate._sum.points ?? 0;
    const rangeMin = Math.max(0, completedPoints - 2);
    const rangeMax = completedPoints + 2;
    await tx.velocityEntry.create({
      data: {
        name: updated.name,
        points: completedPoints,
        range: `${rangeMin}-${rangeMax}`,
        userId,
        workspaceId,
        sprintId: updated.id,
      },
    });
    const sprintTasks = await tx.task.findMany({
      where: { workspaceId, status: TASK_STATUS.SPRINT },
      select: { id: true },
    });
    await tx.task.updateMany({
      where: { workspaceId, status: TASK_STATUS.SPRINT },
      data: { status: TASK_STATUS.BACKLOG, sprintId: null },
    });
    if (sprintTasks.length) {
      await tx.taskStatusEvent.createMany({
        data: sprintTasks.map((task) => ({
          taskId: task.id,
          fromStatus: TASK_STATUS.SPRINT,
          toStatus: TASK_STATUS.BACKLOG,
          actorId: userId,
          trigger: "SPRINT_END" as const,
          workspaceId,
        })),
      });
    }
    return { sprint: updated, completedPoints, range: `${rangeMin}-${rangeMax}` };
  });

  await Promise.all([
    logAudit({
      actorId: userId,
      action: "SPRINT_END",
      targetWorkspaceId: workspaceId,
      metadata: { sprintId: closed.sprint.id, completedPoints: closed.completedPoints },
    }),
    logAudit({
      actorId: userId,
      action: "VELOCITY_AUTO_CREATE",
      targetWorkspaceId: workspaceId,
      metadata: {
        sprintId: closed.sprint.id,
        points: closed.completedPoints,
        range: closed.range,
      },
    }),
  ]);
  return closed.sprint;
}

export async function updateSprint(params: {
  userId: string;
  workspaceId: string;
  sprintId: string;
  input: SprintUpdateInput;
}) {
  const { userId, workspaceId, sprintId, input } = params;
  if (input.name !== undefined && !input.name.trim()) {
    throw badRequest("name is required");
  }
  const data = {
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.capacityPoints !== undefined ? { capacityPoints: input.capacityPoints } : {}),
    ...(input.startedAt !== undefined
      ? { startedAt: input.startedAt ? new Date(input.startedAt) : undefined }
      : {}),
    ...(input.plannedEndAt !== undefined
      ? { plannedEndAt: input.plannedEndAt ? new Date(input.plannedEndAt) : null }
      : {}),
  };
  const updated = await prisma.sprint.updateMany({
    where: { id: sprintId, workspaceId },
    data,
  });
  if (!updated.count) throw notFound("sprint not found");
  const sprint = await prisma.sprint.findUniqueOrThrow({
    where: { id: sprintId },
    select: sprintSelect,
  });
  await logAudit({
    actorId: userId,
    action: "SPRINT_UPDATE",
    targetWorkspaceId: workspaceId,
    metadata: { sprintId },
  });
  return sprint;
}
