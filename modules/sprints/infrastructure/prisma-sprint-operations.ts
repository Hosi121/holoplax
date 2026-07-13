import { Prisma } from "@prisma/client";
import prisma from "../../../lib/prisma";
import { ApplicationError } from "../../shared/application/application-error";
import type { SprintOperationsPort } from "../application/sprint-operations";

const sprintSelect = {
  id: true,
  name: true,
  status: true,
  capacityPoints: true,
  startedAt: true,
  plannedEndAt: true,
  endedAt: true,
} as const;

const error = (kind: "bad_request" | "not_found" | "conflict", message: string) =>
  new ApplicationError(`SPRINT_${kind.toUpperCase()}`, message, kind);

const summarize = (tasks: Array<{ status: string; points: number }>) => ({
  committedPoints: tasks.reduce((sum, task) => sum + task.points, 0),
  completedPoints: tasks.reduce((sum, task) => sum + (task.status === "DONE" ? task.points : 0), 0),
});

export const prismaSprintOperationsPort: SprintOperationsPort = {
  async list(workspaceId, options = {}) {
    const take =
      options.limit !== undefined && Number.isFinite(options.limit) && options.limit > 0
        ? Math.min(Math.trunc(options.limit), 100)
        : undefined;
    const sprints = await prisma.sprint.findMany({
      where: { workspaceId, ...(options.status ? { status: options.status } : {}) },
      orderBy: { startedAt: "desc" },
      ...(take ? { take } : {}),
      select: { ...sprintSelect, tasks: { select: { status: true, points: true } } },
    });
    return sprints.map(({ tasks, ...sprint }) => ({ ...sprint, ...summarize(tasks) }));
  },

  async current(workspaceId) {
    const sprint = await prisma.sprint.findFirst({
      where: { workspaceId, status: "ACTIVE" },
      orderBy: { startedAt: "desc" },
      select: { ...sprintSelect, tasks: { select: { status: true, points: true } } },
    });
    if (!sprint) return null;
    const { tasks, ...current } = sprint;
    return { ...current, ...summarize(tasks) };
  },

  async create(actor, input = {}) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          const active = await tx.sprint.findFirst({
            where: { workspaceId: actor.workspaceId, status: "ACTIVE" },
            select: { id: true },
          });
          if (active) throw error("conflict", "close the active sprint before starting a new one");
          const sprint = await tx.sprint.create({
            data: {
              name: input.name?.trim() || `Sprint-${new Date().toISOString().slice(0, 10)}`,
              capacityPoints: input.capacityPoints ?? 24,
              userId: actor.userId,
              workspaceId: actor.workspaceId,
              plannedEndAt: input.plannedEndAt ? new Date(input.plannedEndAt) : null,
            },
            select: sprintSelect,
          });
          await tx.task.updateMany({
            where: { workspaceId: actor.workspaceId, status: "SPRINT" },
            data: { sprintId: sprint.id },
          });
          await tx.auditLog.create({
            data: {
              actorId: actor.userId,
              action: "SPRINT_START",
              targetWorkspaceId: actor.workspaceId,
              metadata: { sprintId: sprint.id, name: sprint.name },
            },
          });
          return sprint;
        },
        { isolationLevel: "Serializable" },
      );
    } catch (caught) {
      if (caught instanceof Prisma.PrismaClientKnownRequestError && caught.code === "P2002") {
        throw error("conflict", "an active sprint already exists");
      }
      throw caught;
    }
  },

  close(actor) {
    return prisma.$transaction(
      async (tx) => {
        const active = await tx.sprint.findFirst({
          where: { workspaceId: actor.workspaceId, status: "ACTIVE" },
          orderBy: { startedAt: "desc" },
          select: { id: true },
        });
        if (!active) throw error("not_found", "active sprint not found");
        const claimed = await tx.sprint.updateMany({
          where: { id: active.id, workspaceId: actor.workspaceId, status: "ACTIVE" },
          data: { status: "CLOSED", endedAt: new Date() },
        });
        if (!claimed.count) throw error("conflict", "active sprint was already closed");
        const sprint = await tx.sprint.findUniqueOrThrow({
          where: { id: active.id },
          select: sprintSelect,
        });
        const aggregate = await tx.task.aggregate({
          where: { sprintId: active.id, status: "DONE" },
          _sum: { points: true },
        });
        const completedPoints = aggregate._sum.points ?? 0;
        const range = `${Math.max(0, completedPoints - 2)}-${completedPoints + 2}`;
        await tx.velocityEntry.create({
          data: {
            name: sprint.name,
            points: completedPoints,
            range,
            userId: actor.userId,
            workspaceId: actor.workspaceId,
            sprintId: sprint.id,
          },
        });
        const sprintTasks = await tx.task.findMany({
          where: { workspaceId: actor.workspaceId, status: "SPRINT" },
          select: { id: true },
        });
        await tx.task.updateMany({
          where: { workspaceId: actor.workspaceId, status: "SPRINT" },
          data: { status: "BACKLOG", sprintId: null },
        });
        if (sprintTasks.length) {
          await tx.taskStatusEvent.createMany({
            data: sprintTasks.map(({ id }) => ({
              taskId: id,
              fromStatus: "SPRINT" as const,
              toStatus: "BACKLOG" as const,
              actorId: actor.userId,
              trigger: "SPRINT_END" as const,
              workspaceId: actor.workspaceId,
            })),
          });
        }
        await tx.auditLog.createMany({
          data: [
            {
              actorId: actor.userId,
              action: "SPRINT_END",
              targetWorkspaceId: actor.workspaceId,
              metadata: { sprintId: sprint.id, completedPoints },
            },
            {
              actorId: actor.userId,
              action: "VELOCITY_AUTO_CREATE",
              targetWorkspaceId: actor.workspaceId,
              metadata: { sprintId: sprint.id, points: completedPoints, range },
            },
          ],
        });
        return sprint;
      },
      { isolationLevel: "Serializable" },
    );
  },

  update(actor, sprintId, input) {
    if (input.name !== undefined && !input.name.trim()) {
      throw error("bad_request", "name is required");
    }
    return prisma.$transaction(async (tx) => {
      const updated = await tx.sprint.updateMany({
        where: { id: sprintId, workspaceId: actor.workspaceId },
        data: {
          ...(input.name !== undefined ? { name: input.name.trim() } : {}),
          ...(input.capacityPoints !== undefined ? { capacityPoints: input.capacityPoints } : {}),
          ...(input.startedAt !== undefined
            ? { startedAt: input.startedAt ? new Date(input.startedAt) : undefined }
            : {}),
          ...(input.plannedEndAt !== undefined
            ? { plannedEndAt: input.plannedEndAt ? new Date(input.plannedEndAt) : null }
            : {}),
        },
      });
      if (!updated.count) throw error("not_found", "sprint not found");
      const sprint = await tx.sprint.findUniqueOrThrow({
        where: { id: sprintId },
        select: sprintSelect,
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.userId,
          action: "SPRINT_UPDATE",
          targetWorkspaceId: actor.workspaceId,
          metadata: { sprintId },
        },
      });
      return sprint;
    });
  },
};
