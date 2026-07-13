import type { Task } from "@prisma/client";
import { logger } from "../../../lib/logger";
import prisma from "../../../lib/prisma";
import { TASK_STATUS } from "../../../lib/types";
import { ApplicationError } from "../../shared/application/application-error";
import type {
  BulkTaskCommand,
  BulkTaskCommandPort,
  BulkTaskResult,
} from "../application/bulk-task-command";
import { projectLegacyAutomationState } from "../domain/task-automation";
import { findTaskPolicyViolation } from "../domain/task-policy";
import { nextWorkflowState } from "../domain/task-workflow";
import { checkSprintCapacity, findActiveSprint } from "./prisma-sprint-capacity";
import {
  commitTaskToSprint,
  completeTaskCommitment,
  removeTaskFromActiveSprint,
} from "./prisma-sprint-items";
import { applyAutomationForTask as runTaskAutomation } from "./prisma-task-automation";
import { createNextRoutineOccurrence } from "./prisma-task-write";
import { recordWorkflowTransition } from "./prisma-workflow-events";

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
          children: { select: { workflowState: true } },
          dependencies: {
            select: {
              dependsOnId: true,
              dependsOn: { select: { workflowState: true } },
            },
          },
        },
      });
      if (tasks.length !== taskIds.length) {
        throw notFound("one or more tasks were not found");
      }

      if (command.action === "delete") {
        const removedAt = new Date();
        for (const task of tasks) {
          await removeTaskFromActiveSprint(tx, { taskId: task.id, removedAt });
        }
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
            workflowState: command.status === TASK_STATUS.DONE ? "DONE" : task.workflowState,
            checklist: task.checklist,
            hasUnresolvedDependencies: task.dependencies.some(
              (dependency) =>
                dependency.dependsOn.workflowState !== "DONE" &&
                !(command.status === TASK_STATUS.DONE && selectedIds.has(dependency.dependsOnId)),
            ),
            hasIncompleteChildren: task.children.some(
              (child) => child.workflowState !== "DONE" && child.workflowState !== "CANCELED",
            ),
          });
          if (violation) throw badRequest(violation);
          if (command.status === TASK_STATUS.SPRINT && task.children.length > 0) {
            throw badRequest("only leaf work items can be committed to a sprint");
          }
        }

        let sprintId: string | null = null;
        if (command.status === TASK_STATUS.SPRINT) {
          const activeSprint = await findActiveSprint(tx, actor.workspaceId);
          if (!activeSprint) throw badRequest("active sprint not found");
          const tasksToMove = tasks.filter(
            ({ sprintId: currentSprintId }) => currentSprintId !== activeSprint.id,
          );
          const capacity = await checkSprintCapacity(tx, {
            workspaceId: actor.workspaceId,
            additionalPoints: tasksToMove.reduce((sum, task) => sum + task.points, 0),
            activeSprint,
          });
          if (capacity.exceeded) throw badRequest("sprint capacity exceeded");
          sprintId = activeSprint.id;
        }

        await tx.task.updateMany({
          where: { id: { in: taskIds }, workspaceId: actor.workspaceId },
          data: {
            status: command.status,
            // A completed task must retain the sprint it was completed in so
            // sprint close and historical velocity can still attribute it.
            // Only an explicit move back to the backlog removes commitment.
            ...(command.status === TASK_STATUS.SPRINT
              ? { sprintId }
              : command.status === TASK_STATUS.BACKLOG
                ? { sprintId: null }
                : {}),
            ...(command.status === TASK_STATUS.DONE ? { workflowState: "DONE" as const } : {}),
          },
        });
        const reopenedTaskIds =
          command.status === TASK_STATUS.DONE
            ? []
            : tasks.filter(({ workflowState }) => workflowState === "DONE").map(({ id }) => id);
        if (reopenedTaskIds.length) {
          await tx.task.updateMany({
            where: { id: { in: reopenedTaskIds }, workspaceId: actor.workspaceId },
            data: { workflowState: "READY" },
          });
        }
        const changedAt = new Date();
        for (const task of tasks) {
          const workflowState = nextWorkflowState({
            current: task.workflowState,
            requestedStatus: command.status,
          });
          if (command.status === TASK_STATUS.SPRINT && sprintId) {
            await commitTaskToSprint(tx, { sprintId, task, committedAt: changedAt });
          } else if (command.status === TASK_STATUS.BACKLOG) {
            await removeTaskFromActiveSprint(tx, { taskId: task.id, removedAt: changedAt });
          } else if (command.status === TASK_STATUS.DONE && task.sprintId) {
            await completeTaskCommitment(tx, {
              taskId: task.id,
              sprintId: task.sprintId,
              completedAt: changedAt,
            });
          }
          await recordWorkflowTransition(tx, {
            taskId: task.id,
            workspaceId: actor.workspaceId,
            actorId: actor.userId,
            fromState: task.workflowState,
            toState: workflowState,
            trigger: "BULK",
            createdAt: changedAt,
          });
        }
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
      // Updating an estimate does not rewrite the points captured when the
      // item was committed. Capacity therefore remains stable during a sprint.
      for (const task of tasks) {
        if (task.automationStatus !== "PREPARED" && task.automationStatus !== "SPLIT_REJECTED") {
          continue;
        }
        await tx.task.updateMany({
          where: { id: task.id, workspaceId: actor.workspaceId },
          data: {
            automationStatus: "NONE",
            automationState: projectLegacyAutomationState({
              automationStatus: "NONE",
              hierarchyRole: task.hierarchyRole,
            }),
          },
        });
      }
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
