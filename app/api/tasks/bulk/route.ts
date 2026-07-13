import type { Task } from "@prisma/client";
import { z } from "zod";
import { requireWorkspaceAuth } from "../../../../lib/api-guards";
import { withApiHandler } from "../../../../lib/api-handler";
import { ok } from "../../../../lib/api-response";
import { logAudit } from "../../../../lib/audit";
import { applyAutomationForTask } from "../../../../lib/automation";
import { TaskPointsSchema } from "../../../../lib/contracts/task";
import { createDomainErrors } from "../../../../lib/http/errors";
import { parseBody } from "../../../../lib/http/validation";
import prisma from "../../../../lib/prisma";
import { checkSprintCapacity } from "../../../../lib/tasks/sprint-capacity";
import {
  createNextRoutineOccurrence,
  hasIncompleteChecklist,
} from "../../../../lib/tasks/task-write";
import { TASK_STATUS } from "../../../../lib/types";

const errors = createDomainErrors("TASK");

const BulkActionSchema = z.object({
  action: z.enum(["status", "delete", "points"]),
  taskIds: z.array(z.string()).min(1).max(100),
  status: z.enum(["BACKLOG", "SPRINT", "DONE"]).optional(),
  // TaskPointsSchema enforces the Fibonacci allowlist at parse time,
  // replacing a redundant runtime story-point check.
  points: TaskPointsSchema.optional(),
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

      const body = await parseBody(request, BulkActionSchema, {
        code: "TASK_VALIDATION",
      });

      const { action, taskIds, status, points } = body;
      const requestedTaskIds = [...new Set(taskIds)];

      // Validate task IDs belong to workspace
      const existingTasks = await prisma.task.findMany({
        where: { id: { in: requestedTaskIds }, workspaceId },
        include: {
          routineRule: true,
          dependencies: {
            select: {
              dependsOnId: true,
              dependsOn: { select: { status: true } },
            },
          },
        },
      });

      if (existingTasks.length !== requestedTaskIds.length) {
        return errors.notFound("one or more tasks were not found");
      }

      const validTaskIds = existingTasks.map((t) => t.id);

      switch (action) {
        case "status": {
          if (!status) {
            return errors.badRequest("status is required for status action");
          }
          if (
            status === TASK_STATUS.DONE &&
            existingTasks.some((task) => hasIncompleteChecklist(task.checklist))
          ) {
            return errors.badRequest("all checklist items must be complete before moving to done");
          }
          const selectedIds = new Set(validTaskIds);
          const hasUnresolvedDependency = existingTasks.some((task) =>
            task.dependencies.some(
              (dependency) =>
                dependency.dependsOn.status !== TASK_STATUS.DONE &&
                !(status === TASK_STATUS.DONE && selectedIds.has(dependency.dependsOnId)),
            ),
          );
          if (hasUnresolvedDependency && status !== TASK_STATUS.BACKLOG) {
            return errors.badRequest("dependencies must be done before moving");
          }

          let createdRoutineTasks: Task[] = [];

          if (status === TASK_STATUS.SPRINT) {
            // The sprint capacity check and the task updates must happen inside a
            // single serializable transaction.  Without this, two concurrent
            // requests can both pass the capacity check and then both write,
            // causing the sprint to be over-committed (TOCTOU race condition).
            let capacityExceeded = false;

            await prisma.$transaction(
              async (tx) => {
                const tasksToMove = existingTasks.filter((t) => t.status !== TASK_STATUS.SPRINT);
                const cap = await checkSprintCapacity(tx, {
                  workspaceId,
                  additionalPoints: tasksToMove.reduce((sum, t) => sum + t.points, 0),
                  excludeTaskIds: validTaskIds,
                });

                if (!cap.activeSprint) {
                  throw new Error("NO_ACTIVE_SPRINT");
                }

                if (cap.exceeded) {
                  capacityExceeded = true;
                  return; // abort writes; transaction still commits cleanly
                }

                await tx.task.updateMany({
                  where: { id: { in: validTaskIds }, workspaceId },
                  data: { status, sprintId: cap.activeSprint.id },
                });

                if (tasksToMove.length > 0) {
                  await tx.taskStatusEvent.createMany({
                    data: tasksToMove.map((task) => ({
                      taskId: task.id,
                      fromStatus: task.status,
                      toStatus: status,
                      actorId: userId,
                      trigger: "BULK",
                      workspaceId,
                    })),
                  });
                }
              },
              { isolationLevel: "Serializable" },
            );

            if (capacityExceeded) {
              return errors.badRequest("sprint capacity exceeded");
            }
          } else {
            createdRoutineTasks = await prisma.$transaction(async (tx) => {
              await tx.task.updateMany({
                where: { id: { in: validTaskIds }, workspaceId },
                data: {
                  status,
                  ...(status === TASK_STATUS.BACKLOG ? { sprintId: null } : {}),
                },
              });

              const tasksChangingStatus = existingTasks.filter((t) => t.status !== status);
              if (tasksChangingStatus.length > 0) {
                await tx.taskStatusEvent.createMany({
                  data: tasksChangingStatus.map((task) => ({
                    taskId: task.id,
                    fromStatus: task.status,
                    toStatus: status,
                    actorId: userId,
                    trigger: "BULK",
                    workspaceId,
                  })),
                });
              }
              const created: Task[] = [];
              if (status === TASK_STATUS.DONE) {
                for (const task of tasksChangingStatus) {
                  const next = await createNextRoutineOccurrence(tx, {
                    task,
                    userId,
                    workspaceId,
                  });
                  if (next) created.push(next);
                }
              }
              return created;
            });
          }

          for (const task of createdRoutineTasks) {
            await applyAutomationForTask({
              userId,
              workspaceId,
              task: {
                id: task.id,
                title: task.title,
                description: task.description,
                points: task.points,
                status: task.status,
              },
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

          // For sprint tasks, the capacity check and the point update must be
          // atomic.  The "points" action was previously unguarded (no transaction
          // at all), making it vulnerable to concurrent over-commit.
          const sprintTasks = existingTasks.filter((t) => t.status === TASK_STATUS.SPRINT);

          let pointsCapacityExceeded = false;

          await prisma.$transaction(
            async (tx) => {
              if (sprintTasks.length > 0) {
                const cap = await checkSprintCapacity(tx, {
                  workspaceId,
                  additionalPoints: sprintTasks.length * points,
                  excludeTaskIds: validTaskIds,
                });

                if (cap.exceeded) {
                  pointsCapacityExceeded = true;
                  return; // abort writes; transaction still commits cleanly
                }
              }

              await tx.task.updateMany({
                where: {
                  id: { in: validTaskIds },
                  workspaceId,
                  automationState: { in: ["DELEGATED", "SPLIT_REJECTED"] },
                },
                data: { automationState: "NONE" },
              });
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

          for (const task of existingTasks) {
            await applyAutomationForTask({
              userId,
              workspaceId,
              task: {
                id: task.id,
                title: task.title,
                description: task.description,
                points,
                status: task.status,
              },
            });
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
