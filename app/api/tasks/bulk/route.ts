import { z } from "zod";
import { requireWorkspaceAuth } from "../../../../lib/api-guards";
import { withApiHandler } from "../../../../lib/api-handler";
import { ok } from "../../../../lib/api-response";
import { logAudit } from "../../../../lib/audit";
import { createDomainErrors } from "../../../../lib/http/errors";
import { parseBody } from "../../../../lib/http/validation";
import { badPoints } from "../../../../lib/points";
import prisma from "../../../../lib/prisma";
import { TASK_STATUS } from "../../../../lib/types";

const errors = createDomainErrors("TASK");

const BulkActionSchema = z.object({
  action: z.enum(["status", "delete", "points"]),
  taskIds: z.array(z.string()).min(1).max(100),
  status: z.enum(["BACKLOG", "SPRINT", "DONE"]).optional(),
  points: z.number().optional(),
});

export async function POST(request: Request) {
  return withApiHandler(
    {
      logLabel: "POST /api/tasks/bulk",
      errorFallback: {
        code: "TASK_INTERNAL",
        message: "failed to perform bulk operation",
        status: 500,
      },
    },
    async () => {
      const { userId, workspaceId } = await requireWorkspaceAuth({
        domain: "TASK",
        requireWorkspace: true,
      });
      if (!workspaceId) {
        return errors.unauthorized("workspace not selected");
      }

      const body = await parseBody(request, BulkActionSchema, {
        code: "TASK_VALIDATION",
      });

      const { action, taskIds, status, points } = body;

      // Validate task IDs belong to workspace
      const existingTasks = await prisma.task.findMany({
        where: { id: { in: taskIds }, workspaceId },
        select: { id: true, status: true, points: true },
      });

      if (existingTasks.length === 0) {
        return errors.notFound("no tasks found");
      }

      const validTaskIds = existingTasks.map((t) => t.id);

      switch (action) {
        case "status": {
          if (!status) {
            return errors.badRequest("status is required for status action");
          }

          if (status === TASK_STATUS.SPRINT) {
            // The sprint capacity check and the task updates must happen inside a
            // single serializable transaction.  Without this, two concurrent
            // requests can both pass the capacity check and then both write,
            // causing the sprint to be over-committed (TOCTOU race condition).
            let capacityExceeded = false;

            await prisma
              .$transaction(
                async (tx) => {
                  const activeSprint = await tx.sprint.findFirst({
                    where: { workspaceId, status: "ACTIVE" },
                    orderBy: { startedAt: "desc" },
                    select: { id: true, capacityPoints: true },
                  });

                  if (!activeSprint) {
                    throw new Error("NO_ACTIVE_SPRINT");
                  }

                  const currentSprintPoints = await tx.task.aggregate({
                    where: {
                      workspaceId,
                      status: TASK_STATUS.SPRINT,
                      id: { notIn: validTaskIds },
                    },
                    _sum: { points: true },
                  });

                  const tasksToMove = existingTasks.filter((t) => t.status !== TASK_STATUS.SPRINT);
                  const additionalPoints = tasksToMove.reduce((sum, t) => sum + t.points, 0);
                  const nextTotal = (currentSprintPoints._sum.points ?? 0) + additionalPoints;

                  if (nextTotal > activeSprint.capacityPoints) {
                    capacityExceeded = true;
                    return; // abort writes; transaction still commits cleanly
                  }

                  await tx.task.updateMany({
                    where: { id: { in: validTaskIds }, workspaceId },
                    data: { status, sprintId: activeSprint.id },
                  });

                  for (const task of tasksToMove) {
                    await tx.taskStatusEvent.create({
                      data: {
                        taskId: task.id,
                        fromStatus: task.status,
                        toStatus: status,
                        actorId: userId,
                        source: "bulk",
                        workspaceId,
                      },
                    });
                  }
                },
                { isolationLevel: "Serializable" },
              )
              .catch((err: unknown) => {
                if (err instanceof Error && err.message === "NO_ACTIVE_SPRINT") {
                  throw err; // re-throw to be caught below
                }
                throw err;
              });

            if (capacityExceeded) {
              return errors.badRequest("sprint capacity exceeded");
            }
          } else {
            await prisma.$transaction(async (tx) => {
              await tx.task.updateMany({
                where: { id: { in: validTaskIds }, workspaceId },
                data: {
                  status,
                  ...(status === TASK_STATUS.BACKLOG ? { sprintId: null } : {}),
                },
              });

              for (const task of existingTasks) {
                if (task.status !== status) {
                  await tx.taskStatusEvent.create({
                    data: {
                      taskId: task.id,
                      fromStatus: task.status,
                      toStatus: status,
                      actorId: userId,
                      source: "bulk",
                      workspaceId,
                    },
                  });
                }
              }
            });
          }

          await logAudit({
            actorId: userId,
            action: "TASK_BULK_STATUS",
            targetWorkspaceId: workspaceId,
            metadata: { taskIds: validTaskIds, status },
          });

          return ok({
            ok: true,
            action: "status",
            updatedCount: validTaskIds.length,
          });
        }

        case "delete": {
          await prisma.$transaction(async (tx) => {
            await tx.taskDependency.deleteMany({
              where: { taskId: { in: validTaskIds } },
            });
            await tx.aiSuggestion.deleteMany({
              where: { taskId: { in: validTaskIds } },
            });
            await tx.taskComment.deleteMany({
              where: { taskId: { in: validTaskIds } },
            });
            await tx.task.deleteMany({
              where: { id: { in: validTaskIds }, workspaceId },
            });
          });

          await logAudit({
            actorId: userId,
            action: "TASK_BULK_DELETE",
            targetWorkspaceId: workspaceId,
            metadata: { taskIds: validTaskIds },
          });

          return ok({
            ok: true,
            action: "delete",
            deletedCount: validTaskIds.length,
          });
        }

        case "points": {
          if (points === undefined || points === null) {
            return errors.badRequest("points is required for points action");
          }
          if (badPoints(points)) {
            return errors.badRequest("points must be one of 1,2,3,5,8,13,21,34");
          }

          // For sprint tasks, the capacity check and the point update must be
          // atomic.  The "points" action was previously unguarded (no transaction
          // at all), making it vulnerable to concurrent over-commit.
          const sprintTasks = existingTasks.filter((t) => t.status === TASK_STATUS.SPRINT);

          let pointsCapacityExceeded = false;

          await prisma.$transaction(
            async (tx) => {
              if (sprintTasks.length > 0) {
                const activeSprint = await tx.sprint.findFirst({
                  where: { workspaceId, status: "ACTIVE" },
                  orderBy: { startedAt: "desc" },
                  select: { id: true, capacityPoints: true },
                });

                if (activeSprint) {
                  const currentSprintPoints = await tx.task.aggregate({
                    where: {
                      workspaceId,
                      status: TASK_STATUS.SPRINT,
                      id: { notIn: validTaskIds },
                    },
                    _sum: { points: true },
                  });

                  const nextTotal =
                    (currentSprintPoints._sum.points ?? 0) + sprintTasks.length * points;

                  if (nextTotal > activeSprint.capacityPoints) {
                    pointsCapacityExceeded = true;
                    return; // abort writes; transaction still commits cleanly
                  }
                }
              }

              await tx.task.updateMany({
                where: { id: { in: validTaskIds }, workspaceId },
                data: { points },
              });
            },
            { isolationLevel: "Serializable" },
          );

          if (pointsCapacityExceeded) {
            return errors.badRequest("sprint capacity exceeded");
          }

          await logAudit({
            actorId: userId,
            action: "TASK_BULK_POINTS",
            targetWorkspaceId: workspaceId,
            metadata: { taskIds: validTaskIds, points },
          });

          return ok({
            ok: true,
            action: "points",
            updatedCount: validTaskIds.length,
          });
        }

        default:
          return errors.badRequest("invalid action");
      }
    },
  );
}
