import type { Task } from "@prisma/client";
import { logger } from "../../../lib/logger";
import prisma from "../../../lib/prisma";
import { TASK_STATUS } from "../../../lib/types";
import { runTaskAutomation } from "../../automation/index.server";
import { ApplicationError } from "../../shared/application/application-error";
import type {
  BulkTaskCommand,
  BulkTaskCommandPort,
  BulkTaskResult,
} from "../application/bulk-task-command";
import { findTaskPolicyViolation } from "../domain/task-policy";
import { checkSprintCapacity } from "./prisma-sprint-capacity";
import { createNextRoutineOccurrence } from "./prisma-task-write";

const badRequest = (message: string) =>
  new ApplicationError("TASK_BAD_REQUEST", message, "bad_request");
const notFound = (message: string) => new ApplicationError("TASK_NOT_FOUND", message, "not_found");

type AutomationTask = Pick<Task, "id" | "title" | "description" | "points" | "status">;

const executeBulkCommand = async (
  actor: { userId: string; workspaceId: string },
  command: BulkTaskCommand,
): Promise<{ result: BulkTaskResult; automationTasks: AutomationTask[] }> =>
  prisma.$transaction(
    async (tx) => {
      const taskIds = [...new Set(command.taskIds)];
      const tasks = await tx.task.findMany({
        where: { id: { in: taskIds }, workspaceId: actor.workspaceId },
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
      if (tasks.length !== taskIds.length) {
        throw notFound("one or more tasks were not found");
      }

      if (command.action === "delete") {
        const deleted = await tx.task.deleteMany({
          where: { id: { in: taskIds }, workspaceId: actor.workspaceId },
        });
        await tx.auditLog.create({
          data: {
            actorId: actor.userId,
            action: "TASK_BULK_DELETE",
            targetWorkspaceId: actor.workspaceId,
            metadata: { taskIds },
          },
        });
        return {
          result: { ok: true, action: "delete", deletedCount: deleted.count },
          automationTasks: [],
        };
      }

      if (command.action === "status") {
        if (!command.status) throw badRequest("status is required for status action");
        const selectedIds = new Set(taskIds);
        for (const task of tasks) {
          const violation = findTaskPolicyViolation({
            type: task.type,
            status: command.status,
            checklist: task.checklist,
            hasUnresolvedDependencies: task.dependencies.some(
              (dependency) =>
                dependency.dependsOn.status !== TASK_STATUS.DONE &&
                !(command.status === TASK_STATUS.DONE && selectedIds.has(dependency.dependsOnId)),
            ),
          });
          if (violation) throw badRequest(violation);
        }

        let sprintId: string | null = null;
        if (command.status === TASK_STATUS.SPRINT) {
          const tasksToMove = tasks.filter(({ status }) => status !== TASK_STATUS.SPRINT);
          const capacity = await checkSprintCapacity(tx, {
            workspaceId: actor.workspaceId,
            additionalPoints: tasksToMove.reduce((sum, task) => sum + task.points, 0),
            excludeTaskIds: taskIds,
          });
          if (!capacity.activeSprint) throw badRequest("active sprint not found");
          if (capacity.exceeded) throw badRequest("sprint capacity exceeded");
          sprintId = capacity.activeSprint.id;
        }

        await tx.task.updateMany({
          where: { id: { in: taskIds }, workspaceId: actor.workspaceId },
          data: {
            status: command.status,
            ...(command.status === TASK_STATUS.SPRINT ? { sprintId } : { sprintId: null }),
          },
        });
        const changedTasks = tasks.filter(({ status }) => status !== command.status);
        if (changedTasks.length) {
          await tx.taskStatusEvent.createMany({
            data: changedTasks.map((task) => ({
              taskId: task.id,
              fromStatus: task.status,
              toStatus: command.status as "BACKLOG" | "SPRINT" | "DONE",
              actorId: actor.userId,
              trigger: "BULK" as const,
              workspaceId: actor.workspaceId,
            })),
          });
        }

        const automationTasks: AutomationTask[] = [];
        if (command.status === TASK_STATUS.DONE) {
          for (const task of changedTasks) {
            const next = await createNextRoutineOccurrence(tx, {
              task,
              userId: actor.userId,
              workspaceId: actor.workspaceId,
            });
            if (next) automationTasks.push(next);
          }
        }
        await tx.auditLog.create({
          data: {
            actorId: actor.userId,
            action: "TASK_BULK_STATUS",
            targetWorkspaceId: actor.workspaceId,
            metadata: { taskIds, status: command.status },
          },
        });
        return {
          result: { ok: true, action: "status", updatedCount: taskIds.length },
          automationTasks,
        };
      }

      if (command.points === undefined) {
        throw badRequest("points is required for points action");
      }
      const sprintTasks = tasks.filter(({ status }) => status === TASK_STATUS.SPRINT);
      if (sprintTasks.length) {
        const capacity = await checkSprintCapacity(tx, {
          workspaceId: actor.workspaceId,
          additionalPoints: sprintTasks.length * command.points,
          excludeTaskIds: taskIds,
        });
        if (capacity.exceeded) throw badRequest("sprint capacity exceeded");
      }
      await tx.task.updateMany({
        where: {
          id: { in: taskIds },
          workspaceId: actor.workspaceId,
          automationState: { in: ["DELEGATED", "SPLIT_REJECTED"] },
        },
        data: { automationState: "NONE" },
      });
      await tx.task.updateMany({
        where: { id: { in: taskIds }, workspaceId: actor.workspaceId },
        data: { points: command.points },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.userId,
          action: "TASK_BULK_POINTS",
          targetWorkspaceId: actor.workspaceId,
          metadata: { taskIds, points: command.points },
        },
      });
      return {
        result: { ok: true, action: "points", updatedCount: taskIds.length },
        automationTasks: tasks.map((task) => ({ ...task, points: command.points as number })),
      };
    },
    { isolationLevel: "Serializable" },
  );

export const prismaBulkTaskCommandPort: BulkTaskCommandPort = {
  async execute(actor, command) {
    const { result, automationTasks } = await executeBulkCommand(actor, command);
    for (const task of automationTasks) {
      try {
        await runTaskAutomation({ ...actor, task });
      } catch (error) {
        logger.error("TASK_BULK automation failed", { taskId: task.id }, error);
      }
    }
    return result;
  },
};
