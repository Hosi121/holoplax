import { Prisma } from "@prisma/client";
import prisma from "../../../lib/prisma";
import { ApplicationError } from "../../shared/application/application-error";
import { runSerializableTransaction } from "../../shared/infrastructure/prisma-serializable-transaction";
import {
  carryOverSprintCommitments,
  commitTaskToSprint,
} from "../../shared/infrastructure/prisma-sprint-items";
import {
  attachLegacySprintProjection,
  clearClosedSprintProjection,
} from "../../shared/infrastructure/prisma-task-consistency";
import { recordTaskStatusTransitions } from "../../shared/infrastructure/prisma-task-status-events";
import type { SprintOperationsPort } from "../application/sprint-operations";
import { sprintWindowViolation } from "../domain/sprint-policy";

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

const emptySummary = () => ({ committedPoints: 0, activePoints: 0, completedPoints: 0 });

const loadSummaries = async (sprintIds: string[]) => {
  if (!sprintIds.length) return new Map<string, ReturnType<typeof emptySummary>>();
  const [committed, active, completed] = await Promise.all([
    prisma.sprintItem.groupBy({
      by: ["sprintId"],
      where: { sprintId: { in: sprintIds } },
      _sum: { committedPoints: true },
    }),
    prisma.sprintItem.groupBy({
      by: ["sprintId"],
      where: {
        sprintId: { in: sprintIds },
        removedAt: null,
        outcome: { in: ["COMMITTED", "COMPLETED"] },
      },
      _sum: { committedPoints: true },
    }),
    prisma.sprintItem.groupBy({
      by: ["sprintId"],
      where: { sprintId: { in: sprintIds }, outcome: "COMPLETED" },
      _sum: { committedPoints: true },
    }),
  ]);
  const summaries = new Map(sprintIds.map((id) => [id, emptySummary()]));
  for (const row of committed) {
    summaries.get(row.sprintId)!.committedPoints = row._sum.committedPoints ?? 0;
  }
  for (const row of active) {
    summaries.get(row.sprintId)!.activePoints = row._sum.committedPoints ?? 0;
  }
  for (const row of completed) {
    summaries.get(row.sprintId)!.completedPoints = row._sum.committedPoints ?? 0;
  }
  return summaries;
};

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
      select: sprintSelect,
    });
    const summaries = await loadSummaries(sprints.map(({ id }) => id));
    return sprints.map((sprint) => ({
      ...sprint,
      ...(summaries.get(sprint.id) ?? emptySummary()),
    }));
  },

  async current(workspaceId) {
    const sprint = await prisma.sprint.findFirst({
      where: { workspaceId, status: "ACTIVE" },
      orderBy: { startedAt: "desc" },
      select: sprintSelect,
    });
    if (!sprint) return null;
    const summaries = await loadSummaries([sprint.id]);
    return { ...sprint, ...(summaries.get(sprint.id) ?? emptySummary()) };
  },

  async create(actor, input = {}) {
    const startedAt = new Date();
    const plannedEndAt = input.plannedEndAt ? new Date(input.plannedEndAt) : null;
    const windowViolation = sprintWindowViolation({ startedAt, plannedEndAt });
    if (windowViolation) throw error("bad_request", windowViolation);
    try {
      return await runSerializableTransaction(
        async (tx) => {
          const active = await tx.sprint.findFirst({
            where: { workspaceId: actor.workspaceId, status: "ACTIVE" },
            select: { id: true },
          });
          if (active) throw error("conflict", "close the active sprint before starting a new one");
          const legacySprintTasks = await tx.task.findMany({
            where: { workspaceId: actor.workspaceId, status: "SPRINT" },
            select: { id: true, title: true, type: true, points: true },
          });
          const capacityPoints = input.capacityPoints ?? 24;
          if (legacySprintTasks.reduce((sum, task) => sum + task.points, 0) > capacityPoints) {
            throw error("bad_request", "tasks selected for the sprint exceed its capacity");
          }
          const sprint = await tx.sprint.create({
            data: {
              name: input.name?.trim() || `Sprint-${new Date().toISOString().slice(0, 10)}`,
              capacityPoints,
              userId: actor.userId,
              workspaceId: actor.workspaceId,
              startedAt,
              plannedEndAt,
            },
            select: sprintSelect,
          });
          await attachLegacySprintProjection(tx, {
            workspaceId: actor.workspaceId,
            sprintId: sprint.id,
          });
          for (const task of legacySprintTasks) {
            await commitTaskToSprint(tx, { sprintId: sprint.id, task });
          }
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
        {
          code: "SPRINT_CONCURRENT_UPDATE",
          message: "sprint changed concurrently; retry the operation",
        },
      );
    } catch (caught) {
      if (caught instanceof Prisma.PrismaClientKnownRequestError && caught.code === "P2002") {
        throw error("conflict", "an active sprint already exists");
      }
      throw caught;
    }
  },

  close(actor) {
    return runSerializableTransaction(
      async (tx) => {
        const active = await tx.sprint.findFirst({
          where: { workspaceId: actor.workspaceId, status: "ACTIVE" },
          orderBy: { startedAt: "desc" },
          select: { id: true },
        });
        if (!active) throw error("not_found", "active sprint not found");
        const closedAt = new Date();
        const claimed = await tx.sprint.updateMany({
          where: { id: active.id, workspaceId: actor.workspaceId, status: "ACTIVE" },
          data: { status: "CLOSED", endedAt: closedAt },
        });
        if (!claimed.count) throw error("conflict", "active sprint was already closed");
        const sprint = await tx.sprint.findUniqueOrThrow({
          where: { id: active.id },
          select: sprintSelect,
        });
        const aggregate = await tx.sprintItem.aggregate({
          where: { sprintId: active.id, outcome: "COMPLETED" },
          _sum: { committedPoints: true },
        });
        const completedPoints = aggregate._sum.committedPoints ?? 0;
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
          where: { workspaceId: actor.workspaceId, sprintId: active.id, status: "SPRINT" },
          select: { id: true, title: true },
        });
        await clearClosedSprintProjection(tx, {
          workspaceId: actor.workspaceId,
          sprintId: active.id,
        });
        await carryOverSprintCommitments(tx, { sprintId: active.id, carriedAt: closedAt });
        if (sprintTasks.length) {
          await recordTaskStatusTransitions(
            tx,
            sprintTasks.map(({ id, title }) => ({
              taskId: id,
              taskTitle: title,
              fromStatus: "SPRINT" as const,
              toStatus: "BACKLOG" as const,
              actorId: actor.userId,
              trigger: "SPRINT_END" as const,
              workspaceId: actor.workspaceId,
            })),
          );
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
      {
        code: "SPRINT_CONCURRENT_UPDATE",
        message: "sprint changed concurrently; retry the operation",
      },
    );
  },

  update(actor, sprintId, input) {
    if (input.name !== undefined && !input.name.trim()) {
      throw error("bad_request", "name is required");
    }
    return runSerializableTransaction(
      async (tx) => {
        const current = await tx.sprint.findFirst({
          where: { id: sprintId, workspaceId: actor.workspaceId },
          select: { id: true, status: true, startedAt: true, plannedEndAt: true },
        });
        if (!current) throw error("not_found", "sprint not found");
        const startedAt = input.startedAt ? new Date(input.startedAt) : current.startedAt;
        const plannedEndAt =
          input.plannedEndAt === undefined
            ? current.plannedEndAt
            : input.plannedEndAt
              ? new Date(input.plannedEndAt)
              : null;
        const windowViolation = sprintWindowViolation({ startedAt, plannedEndAt });
        if (windowViolation) throw error("bad_request", windowViolation);
        if (current.status === "ACTIVE" && input.capacityPoints !== undefined) {
          const committed = await tx.sprintItem.aggregate({
            where: {
              sprintId,
              removedAt: null,
              outcome: { in: ["COMMITTED", "COMPLETED"] },
            },
            _sum: { committedPoints: true },
          });
          if ((committed._sum.committedPoints ?? 0) > input.capacityPoints) {
            throw error("bad_request", "capacity cannot be lower than committed points");
          }
        }
        const updated = await tx.sprint.updateMany({
          where: { id: sprintId, workspaceId: actor.workspaceId },
          data: {
            ...(input.name !== undefined ? { name: input.name.trim() } : {}),
            ...(input.capacityPoints !== undefined ? { capacityPoints: input.capacityPoints } : {}),
            ...(input.startedAt !== undefined ? { startedAt } : {}),
            ...(input.plannedEndAt !== undefined ? { plannedEndAt } : {}),
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
      },
      {
        code: "SPRINT_CONCURRENT_UPDATE",
        message: "sprint changed concurrently; retry the operation",
      },
    );
  },
};
