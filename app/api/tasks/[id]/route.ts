import { Prisma, type TaskStatus, type TaskType } from "@prisma/client";
import { randomUUID } from "crypto";
import { requireWorkspaceAuth } from "../../../../lib/api-guards";
import { withApiHandler } from "../../../../lib/api-handler";
import { ok } from "../../../../lib/api-response";
import { logAudit } from "../../../../lib/audit";
import { applyAutomationForTask } from "../../../../lib/automation";
import { TaskUpdateSchema } from "../../../../lib/contracts/task";
import { createDomainErrors } from "../../../../lib/http/errors";
import { parseBody } from "../../../../lib/http/validation";
import { logger } from "../../../../lib/logger";
import { badPoints } from "../../../../lib/points";
import prisma from "../../../../lib/prisma";
import { TASK_STATUS, TASK_TYPE } from "../../../../lib/types";

const isTaskStatus = (value: unknown): value is TaskStatus =>
  Object.values(TASK_STATUS).includes(value as TaskStatus);

const isTaskType = (value: unknown): value is TaskType =>
  Object.values(TASK_TYPE).includes(value as TaskType);

const toNullableJsonInput = (
  value: unknown | null | undefined,
): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.DbNull;
  return value as Prisma.InputJsonValue;
};

const toChecklist = (value: unknown) => {
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

const normalizeChecklistForReset = (value: unknown) => {
  if (!Array.isArray(value)) return null;
  return value
    .map((item) => {
      if (item && typeof item === "object") {
        const obj = item as Record<string, unknown>;
        const text = typeof obj.text === "string" ? obj.text : String(obj.text ?? "");
        return {
          id: typeof obj.id === "string" ? obj.id : randomUUID(),
          text: text.trim(),
          done: false,
        };
      }
      const fallback = String(item ?? "").trim();
      return {
        id: randomUUID(),
        text: fallback,
        done: false,
      };
    })
    .filter((item) => item.text.length > 0);
};

const nextRoutineAt = (cadence: "DAILY" | "WEEKLY", base: Date) => {
  const next = new Date(base);
  if (cadence === "DAILY") {
    next.setDate(next.getDate() + 1);
  } else {
    next.setDate(next.getDate() + 7);
  }
  return next;
};
const errors = createDomainErrors("TASK");

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withApiHandler(
    {
      logLabel: "PATCH /api/tasks/[id]",
      errorFallback: {
        code: "TASK_INTERNAL",
        message: "failed to update task",
        status: 500,
      },
    },
    async () => {
      const { id } = await params;
      const body = await parseBody(request, TaskUpdateSchema, {
        code: "TASK_VALIDATION",
      });
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
      const checklistValue = toChecklist(body.checklist);
      if (checklistValue !== undefined) {
        data.checklist = checklistValue;
      }
      if (body.points !== undefined && body.points !== null) {
        if (badPoints(body.points)) {
          return errors.badRequest("points must be one of 1,2,3,5,8,13,21,34");
        }
        data.points = Number(body.points);
      }
      if (body.urgency) data.urgency = body.urgency;
      if (body.risk) data.risk = body.risk;
      if (body.type !== undefined) {
        data.type = isTaskType(body.type) ? body.type : TASK_TYPE.PBI;
      }
      // automationState is intentionally not writable by users.
      // It is managed exclusively by the server-side automation engine.
      if (body.dueDate !== undefined) {
        data.dueDate = body.dueDate ? new Date(body.dueDate) : null;
      }
      if (body.tags !== undefined) {
        data.tags = Array.isArray(body.tags) ? body.tags.map((tag: string) => String(tag)) : [];
      }
      const statusValue = body.status && isTaskStatus(body.status) ? body.status : null;
      logger.debug("TASK_UPDATE narrowed", {
        statusValue,
        typeValue: data.type ?? null,
      });
      if (statusValue) {
        data.status = statusValue;
      }
      const cadenceValue =
        body.routineCadence === "DAILY" || body.routineCadence === "WEEKLY"
          ? body.routineCadence
          : null;
      const shouldClearRoutine =
        body.routineCadence === null ||
        body.routineCadence === "" ||
        body.routineCadence === "NONE";
      const routineNextAt =
        body.routineNextAt !== undefined && body.routineNextAt !== null
          ? new Date(body.routineNextAt)
          : null;

      const { userId, workspaceId } = await requireWorkspaceAuth();
      if (!workspaceId) {
        return errors.notFound("workspace not selected");
      }

      // Optimized: Fetch task with related data in a single query
      const currentTask = await prisma.task.findFirst({
        where: { id, workspaceId },
        include: {
          routineRule: true,
          // Include blocking dependencies if status change is requested
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
        return errors.notFound();
      }

      // Check blocking dependencies (already fetched above)
      if (
        (statusValue === TASK_STATUS.SPRINT || statusValue === TASK_STATUS.DONE) &&
        currentTask.dependencies &&
        currentTask.dependencies.length > 0
      ) {
        return errors.badRequest("dependencies must be done before moving");
      }

      // Optimized: Batch fetch assignee validation, parent validation, and sprint info
      const needsAssigneeCheck = body.assigneeId !== undefined && body.assigneeId;
      const needsParentCheck = body.parentId !== undefined && body.parentId && body.parentId !== id;
      const needsSprintCheck = statusValue === TASK_STATUS.SPRINT;

      // Build parallel queries
      const [memberResult, parentResult, sprintData] = await Promise.all([
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
          ? prisma.$transaction([
              prisma.sprint.findFirst({
                where: { workspaceId, status: "ACTIVE" },
                orderBy: { startedAt: "desc" },
                select: { id: true, capacityPoints: true },
              }),
              prisma.task.aggregate({
                where: { workspaceId, status: TASK_STATUS.SPRINT, id: { not: id } },
                _sum: { points: true },
              }),
            ])
          : Promise.resolve(null),
      ]);

      // Process assignee
      if (body.assigneeId !== undefined) {
        if (body.assigneeId) {
          data.assigneeId = memberResult ? String(body.assigneeId) : null;
        } else {
          data.assigneeId = null;
        }
      }

      // Process parent
      if (body.parentId !== undefined) {
        if (body.parentId && body.parentId !== id) {
          data.parentId = parentResult ? parentResult.id : null;
        } else {
          data.parentId = null;
        }
      }

      // Process sprint capacity check
      if (statusValue === TASK_STATUS.SPRINT) {
        const [activeSprint, currentPointsAgg] = sprintData as [
          { id: string; capacityPoints: number } | null,
          { _sum: { points: number | null } },
        ];
        if (!activeSprint) {
          return errors.badRequest("active sprint not found");
        }
        const currentPoints = currentTask.points ?? 0;
        const nextPoints =
          (currentPointsAgg._sum.points ?? 0) +
          (typeof data.points === "number" ? data.points : currentPoints);
        if (nextPoints > activeSprint.capacityPoints) {
          return errors.badRequest("sprint capacity exceeded");
        }
        data.sprintId = activeSprint.id;
      }
      if (statusValue === TASK_STATUS.BACKLOG) {
        data.sprintId = null;
      }

      // Transaction: Ensure atomic updates for task, dependencies, routine rules, and audit
      const { task, createdRoutineTask } = await prisma.$transaction(async (tx) => {
        const updated = await tx.task.updateMany({
          where: { id, workspaceId },
          data,
        });
        if (!updated.count) {
          throw new Error("TASK_NOT_FOUND");
        }

        const updatedTask = await tx.task.findFirst({
          where: { id, workspaceId },
          include: { routineRule: true },
        });

        // Update dependencies
        if (Array.isArray(body.dependencyIds)) {
          const dependencyIds = body.dependencyIds.map((depId: string) => String(depId));
          const allowed = dependencyIds.length
            ? await tx.task.findMany({
                where: { id: { in: dependencyIds }, workspaceId },
                select: { id: true },
              })
            : [];
          await tx.taskDependency.deleteMany({ where: { taskId: id } });
          if (allowed.length > 0) {
            await tx.taskDependency.createMany({
              data: allowed
                .map((dep) => dep.id)
                .filter((depId) => depId && depId !== id)
                .map((depId) => ({ taskId: id, dependsOnId: depId })),
              skipDuplicates: true,
            });
          }
        }

        // Update routine rules
        if (updatedTask) {
          const finalType = (updatedTask.type ?? TASK_TYPE.PBI) as string;
          if (finalType !== TASK_TYPE.ROUTINE && updatedTask.routineRule) {
            await tx.routineRule.delete({ where: { taskId: updatedTask.id } });
          } else if (finalType === TASK_TYPE.ROUTINE) {
            if (cadenceValue) {
              const baseDate = updatedTask.dueDate ? new Date(updatedTask.dueDate) : new Date();
              const nextAt =
                routineNextAt ??
                updatedTask.routineRule?.nextAt ??
                nextRoutineAt(cadenceValue, baseDate);
              await tx.routineRule.upsert({
                where: { taskId: updatedTask.id },
                update: { cadence: cadenceValue, nextAt },
                create: { taskId: updatedTask.id, cadence: cadenceValue, nextAt },
              });
            } else if (routineNextAt && updatedTask.routineRule) {
              await tx.routineRule.update({
                where: { taskId: updatedTask.id },
                data: { nextAt: routineNextAt },
              });
            } else if (shouldClearRoutine && updatedTask.routineRule) {
              await tx.routineRule.delete({ where: { taskId: updatedTask.id } });
            }
          }
        }

        // Create audit log
        await tx.auditLog.create({
          data: {
            actorId: userId,
            action: "TASK_UPDATE",
            targetWorkspaceId: workspaceId,
            metadata: { taskId: id },
          },
        });

        // Create status event if status changed
        if (updatedTask && statusValue && currentTask.status !== statusValue) {
          await tx.taskStatusEvent.create({
            data: {
              taskId: updatedTask.id,
              fromStatus: currentTask.status ?? null,
              toStatus: statusValue,
              actorId: userId,
              source: "api",
              workspaceId,
            },
          });
        }

        // Handle routine task completion - create next occurrence
        let newRoutineTask = null;
        if (
          updatedTask &&
          statusValue === TASK_STATUS.DONE &&
          currentTask.status !== TASK_STATUS.DONE &&
          updatedTask.type === TASK_TYPE.ROUTINE
        ) {
          const rule = updatedTask.routineRule
            ? updatedTask.routineRule
            : await tx.routineRule.findUnique({ where: { taskId: updatedTask.id } });
          if (rule) {
            const now = new Date();
            const dueAt = rule.nextAt && rule.nextAt > now ? rule.nextAt : now;
            const nextAt = nextRoutineAt(rule.cadence as "DAILY" | "WEEKLY", dueAt);
            const resetChecklist = normalizeChecklistForReset(updatedTask.checklist);
            newRoutineTask = await tx.task.create({
              data: {
                title: updatedTask.title,
                description: updatedTask.description ?? "",
                definitionOfDone: updatedTask.definitionOfDone ?? "",
                checklist: toNullableJsonInput(resetChecklist),
                points: updatedTask.points,
                urgency: updatedTask.urgency,
                risk: updatedTask.risk,
                status: TASK_STATUS.BACKLOG,
                type: TASK_TYPE.ROUTINE,
                dueDate: dueAt,
                tags: updatedTask.tags ?? [],
                assigneeId: updatedTask.assigneeId ?? null,
                userId: updatedTask.userId ?? userId,
                workspaceId,
              },
            });
            await tx.routineRule.update({
              where: { taskId: updatedTask.id },
              data: { taskId: newRoutineTask.id, nextAt },
            });
            await tx.taskStatusEvent.create({
              data: {
                taskId: newRoutineTask.id,
                fromStatus: null,
                toStatus: TASK_STATUS.BACKLOG,
                actorId: userId,
                source: "routine",
                workspaceId,
              },
            });
          }
        }

        return { task: updatedTask, createdRoutineTask: newRoutineTask };
      });

      if (!task) {
        return errors.notFound();
      }

      // Apply automation (outside transaction - may have side effects)
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

      return ok({ task });
    },
  );
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withApiHandler(
    {
      logLabel: "DELETE /api/tasks/[id]",
      errorFallback: {
        code: "TASK_INTERNAL",
        message: "failed to delete task",
        status: 500,
      },
    },
    async () => {
      const { id } = await params;
      const { userId, workspaceId } = await requireWorkspaceAuth();
      if (!workspaceId) {
        return errors.notFound("workspace not selected");
      }
      await prisma.taskDependency.deleteMany({ where: { taskId: id } });
      await prisma.aiSuggestion.deleteMany({ where: { taskId: id } });
      const deleted = await prisma.task.deleteMany({ where: { id, workspaceId } });
      if (!deleted.count) {
        return errors.notFound();
      }
      await logAudit({
        actorId: userId,
        action: "TASK_DELETE",
        targetWorkspaceId: workspaceId,
        metadata: { taskId: id },
      });
      return ok({ ok: true });
    },
  );
}
