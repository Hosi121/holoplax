import type { Prisma, Severity, TaskStatus, TaskType } from "@prisma/client";
import { mapTaskWithDependencies } from "../../../lib/mappers/task";
import prisma from "../../../lib/prisma";

type PrismaTaskListFilters = {
  statuses?: TaskStatus[];
  types?: TaskType[];
  urgency?: Severity;
  risk?: Severity;
  tags?: string[];
  assigneeId?: string;
  dueBefore?: Date;
  dueAfter?: Date;
  minPoints?: number;
  maxPoints?: number;
  search?: string;
  limit?: number;
  cursor?: string;
  page?: number;
};

const taskRelations = {
  routineRule: { select: { cadence: true, nextAt: true } },
  dependencies: {
    select: {
      dependsOnId: true,
      dependsOn: { select: { id: true, title: true, status: true } },
    },
  },
} satisfies Prisma.TaskInclude;

export async function listTasks(workspaceId: string, filters: PrismaTaskListFilters = {}) {
  const requestedLimit = filters.limit;
  const take = Math.trunc(
    Math.min(
      500,
      Math.max(
        10,
        requestedLimit !== undefined && Number.isFinite(requestedLimit) ? requestedLimit : 200,
      ),
    ),
  );
  const minPoints =
    filters.minPoints !== undefined && Number.isFinite(filters.minPoints) && filters.minPoints > 0
      ? filters.minPoints
      : undefined;
  const maxPoints =
    filters.maxPoints !== undefined && Number.isFinite(filters.maxPoints) && filters.maxPoints > 0
      ? filters.maxPoints
      : undefined;

  const where: Prisma.TaskWhereInput = {
    workspaceId,
    ...(filters.statuses?.length ? { status: { in: filters.statuses } } : {}),
    ...(filters.types?.length ? { type: { in: filters.types } } : {}),
    ...(filters.urgency ? { urgency: filters.urgency } : {}),
    ...(filters.risk ? { risk: filters.risk } : {}),
    ...(filters.assigneeId ? { assigneeId: filters.assigneeId } : {}),
    ...(filters.tags?.length ? { tags: { hasSome: filters.tags } } : {}),
    ...(filters.dueBefore || filters.dueAfter
      ? {
          dueDate: {
            ...(filters.dueBefore ? { lte: filters.dueBefore } : {}),
            ...(filters.dueAfter ? { gte: filters.dueAfter } : {}),
          },
        }
      : {}),
    ...(minPoints !== undefined || maxPoints !== undefined
      ? {
          points: {
            ...(minPoints !== undefined ? { gte: minPoints } : {}),
            ...(maxPoints !== undefined ? { lte: maxPoints } : {}),
          },
        }
      : {}),
    ...(filters.search
      ? {
          OR: [
            { title: { contains: filters.search, mode: "insensitive" as const } },
            { description: { contains: filters.search, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const orderBy = [{ createdAt: "desc" as const }, { id: "desc" as const }];
  const page = Math.trunc(Math.max(0, Number.isFinite(filters.page) ? (filters.page ?? 0) : 0));
  const rows = await prisma.task.findMany({
    where,
    orderBy,
    take: take + 1,
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : { skip: page * take }),
    include: taskRelations,
  });
  const hasMore = rows.length > take;
  const results = hasMore ? rows.slice(0, take) : rows;

  return {
    tasks: results.map(mapTaskWithDependencies),
    nextCursor: hasMore ? (results.at(-1)?.id ?? null) : null,
    hasMore,
    ...(filters.cursor ? {} : { page }),
  };
}

export async function getTask(workspaceId: string, taskId: string) {
  const task = await prisma.task.findFirst({
    where: { id: taskId, workspaceId },
    include: taskRelations,
  });
  return task ? mapTaskWithDependencies(task) : null;
}
