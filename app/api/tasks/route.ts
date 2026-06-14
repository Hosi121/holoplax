import type { Prisma } from "@prisma/client";
import { requireWorkspaceAuth } from "../../../lib/api-guards";
import { withApiHandler } from "../../../lib/api-handler";
import { ok } from "../../../lib/api-response";
import { TaskCreateSchema } from "../../../lib/contracts/task";
import { parseBody } from "../../../lib/http/validation";
import { mapTaskWithDependencies } from "../../../lib/mappers/task";
import prisma from "../../../lib/prisma";
import { createTask, isSeverity, isTaskStatus, isTaskType } from "../../../lib/tasks/task-service";

export async function GET(request: Request) {
  return withApiHandler(
    {
      logLabel: "GET /api/tasks",
      errorFallback: {
        code: "TASK_INTERNAL",
        message: "failed to load tasks",
        status: 500,
      },
    },
    async () => {
      const { workspaceId } = await requireWorkspaceAuth();
      if (!workspaceId) {
        return ok({ tasks: [], nextCursor: null });
      }
      const { searchParams } = new URL(request.url);
      const rawStatuses = searchParams
        .getAll("status")
        .map((value) => String(value ?? "").trim())
        .filter(Boolean);
      const statuses = rawStatuses.filter((value) => isTaskStatus(value));

      // Search and filter parameters
      const q = searchParams.get("q")?.trim() ?? "";
      const rawTypes = searchParams.get("type")?.split(",").filter(Boolean) ?? [];
      const types = rawTypes.filter((t) => isTaskType(t));
      const urgencyParam = searchParams.get("urgency");
      const riskParam = searchParams.get("risk");
      const tagsParam = searchParams.get("tags")?.split(",").filter(Boolean) ?? [];
      const assigneeId = searchParams.get("assigneeId");
      // Parse to a valid Date or undefined — an invalid string would otherwise
      // produce `Invalid Date`, which Prisma rejects with a 500 instead of a 400.
      const parseValidDate = (value: string | null): Date | undefined => {
        if (!value) return undefined;
        const date = new Date(value);
        return Number.isNaN(date.getTime()) ? undefined : date;
      };
      const dueBefore = parseValidDate(searchParams.get("dueBefore"));
      const dueAfter = parseValidDate(searchParams.get("dueAfter"));
      const minPoints = Number(searchParams.get("minPoints"));
      const maxPoints = Number(searchParams.get("maxPoints"));

      // Pagination parameters
      const limitParam = Number(searchParams.get("limit") ?? "200");
      const take = Math.min(500, Math.max(10, Number.isFinite(limitParam) ? limitParam : 200));

      // Support both cursor-based and offset-based pagination
      const cursor = searchParams.get("cursor");
      const pageParam = Number(searchParams.get("page") ?? "0");

      const where: Prisma.TaskWhereInput = {
        workspaceId,
        ...(statuses.length ? { status: { in: statuses } } : {}),
        ...(types.length ? { type: { in: types } } : {}),
        ...(isSeverity(urgencyParam) ? { urgency: urgencyParam } : {}),
        ...(isSeverity(riskParam) ? { risk: riskParam } : {}),
        ...(assigneeId ? { assigneeId } : {}),
        ...(tagsParam.length ? { tags: { hasSome: tagsParam } } : {}),
        ...(dueBefore || dueAfter
          ? {
              dueDate: {
                ...(dueBefore ? { lte: dueBefore } : {}),
                ...(dueAfter ? { gte: dueAfter } : {}),
              },
            }
          : {}),
        ...(Number.isFinite(minPoints) && minPoints > 0 ? { points: { gte: minPoints } } : {}),
        ...(Number.isFinite(maxPoints) && maxPoints > 0
          ? {
              points: {
                ...(Number.isFinite(minPoints) && minPoints > 0 ? { gte: minPoints } : {}),
                lte: maxPoints,
              },
            }
          : {}),
        ...(q
          ? {
              OR: [
                { title: { contains: q, mode: "insensitive" } },
                { description: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      };

      // Use cursor-based pagination if cursor is provided
      if (cursor) {
        const tasks = await prisma.task.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: take + 1, // Fetch one extra to determine if there's a next page
          cursor: { id: cursor },
          skip: 1, // Skip the cursor item itself
          include: {
            routineRule: {
              select: { cadence: true, nextAt: true },
            },
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

        return ok({
          tasks: results.map(mapTaskWithDependencies),
          nextCursor,
          hasMore,
        });
      }

      // Fallback to offset-based pagination for backward compatibility
      const skip = Math.max(0, Number.isFinite(pageParam) ? pageParam : 0) * take;
      const tasks = await prisma.task.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: take + 1, // Fetch one extra to determine if there's a next page
        include: {
          routineRule: {
            select: { cadence: true, nextAt: true },
          },
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

      return ok({
        tasks: results.map(mapTaskWithDependencies),
        nextCursor,
        hasMore,
        // Include page info for offset pagination
        page: pageParam,
      });
    },
  );
}

export async function POST(request: Request) {
  return withApiHandler(
    {
      logLabel: "POST /api/tasks",
      errorFallback: {
        code: "TASK_INTERNAL",
        message: "failed to create task",
        status: 500,
      },
    },
    async () => {
      const { userId, workspaceId } = await requireWorkspaceAuth({
        domain: "TASK",
        requireWorkspace: true,
      });
      const input = await parseBody(request, TaskCreateSchema, { code: "TASK_VALIDATION" });
      const task = await createTask({ userId, workspaceId, input });
      return ok({ task });
    },
  );
}
