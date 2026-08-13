import type { Task } from "@prisma/client";
import { ApplicationError } from "../../shared/application/application-error";
import { runSerializableTransaction } from "../../shared/infrastructure/prisma-serializable-transaction";
import {
  commitTaskToSprint,
  completeTaskCommitment,
  removeTaskFromActiveSprint,
} from "../../shared/infrastructure/prisma-sprint-items";
import { recordTaskStatusTransitions } from "../../shared/infrastructure/prisma-task-status-events";
import type {
  BulkTaskCommand,
  BulkTaskCommandPort,
  BulkTaskPlanners,
  BulkTaskResult,
} from "../application/bulk-task-command";
import { projectLegacyAutomationState } from "../domain/task-automation";
import { deriveLegacyStatus } from "../domain/task-workflow";
import { checkSprintCapacity, findActiveSprint } from "./prisma-sprint-capacity";
import { enqueueTaskAutomation, wakeTaskAutomationWorker } from "./prisma-task-automation-jobs";
import {
  createNextRoutineOccurrence,
  deactivateRoutineSeriesForDeletedTask,
} from "./prisma-task-write";
import { recordWorkflowTransition } from "./prisma-workflow-events";

const badRequest = (message: string) =>
  new ApplicationError("TASK_BAD_REQUEST", message, "bad_request");
const notFound = (message: string) => new ApplicationError("TASK_NOT_FOUND", message, "not_found");

type AutomationTask = Pick<
  Task,
  "id" | "title" | "description" | "points" | "workflowState" | "updatedAt"
>;

const executeBulkCommand = async (
  actor: { userId: string; workspaceId: string },
  command: BulkTaskCommand,
  planners: BulkTaskPlanners,
): Promise<BulkTaskResult> =>
  runSerializableTransaction(
    async (tx) => {
      const taskIds = [...new Set(command.taskIds)];
      const tasks = await tx.task.findMany({
        where: { id: { in: taskIds }, workspaceId: actor.workspaceId },
        include: {
          routineRule: true,
          sprint: { select: { status: true } },
          children: { select: { workflowState: true } },
          dependencies: {
            where: { state: "REQUIRED" },
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
          await deactivateRoutineSeriesForDeletedTask(tx, task);
          await removeTaskFromActiveSprint(tx, { taskId: task.id, removedAt });
          if (task.workflowState !== "DONE" && task.workflowState !== "CANCELED") {
            await recordWorkflowTransition(tx, {
              taskId: task.id,
              workspaceId: actor.workspaceId,
              actorId: actor.userId,
              fromState: task.workflowState,
              toState: "CANCELED",
              trigger: "BULK",
              createdAt: removedAt,
            });
          }
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
        return { ok: true, action: "delete", deletedCount: deleted.count };
      }

      if (command.action === "status") {
        if (!command.status) throw badRequest("status is required for status action");
        const executionPlan = planners.planStatus({
          requestedStatus: command.status,
          tasks: tasks.map((task) => ({
            id: task.id,
            status: deriveLegacyStatus({
              workflowState: task.workflowState,
              isInActiveSprint: task.sprint?.status === "ACTIVE",
            }),
            workflowState: task.workflowState,
            type: task.type,
            checklist: task.checklist,
            dependencies: task.dependencies.map((dependency) => ({
              id: dependency.dependsOnId,
              workflowState: dependency.dependsOn.workflowState,
            })),
            children: task.children,
          })),
        });
        if (!executionPlan.ok) throw badRequest(executionPlan.violation);
        const taskPlans = new Map(executionPlan.tasks.map((plan) => [plan.taskId, plan]));

        let sprintId: string | null = null;
        if (executionPlan.requiresActiveSprint) {
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

        const changedAt = new Date();
        for (const task of tasks) {
          const taskPlan = taskPlans.get(task.id);
          if (!taskPlan) throw new Error("TASK_LIFECYCLE_PLAN_MISSING");
          const updated = await tx.task.updateMany({
            where: { id: task.id, workspaceId: actor.workspaceId },
            data: {
              workflowState: taskPlan.workflowState,
              ...(taskPlan.planningAction === "COMMIT"
                ? { sprintId }
                : taskPlan.planningAction === "REMOVE"
                  ? { sprintId: null }
                  : {}),
            },
          });
          if (!updated.count) throw notFound("task disappeared while applying lifecycle plan");
          if (taskPlan.planningAction === "COMMIT" && sprintId) {
            await commitTaskToSprint(tx, { sprintId, task, committedAt: changedAt });
          } else if (taskPlan.planningAction === "REMOVE") {
            await removeTaskFromActiveSprint(tx, { taskId: task.id, removedAt: changedAt });
          } else if (taskPlan.planningAction === "COMPLETE" && task.sprintId) {
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
            toState: taskPlan.workflowState,
            trigger: "BULK",
            createdAt: changedAt,
          });
        }
        const changedTasks = tasks
          .map((task) => ({
            task,
            currentStatus: deriveLegacyStatus({
              workflowState: task.workflowState,
              isInActiveSprint: task.sprint?.status === "ACTIVE",
            }),
            plan: taskPlans.get(task.id),
          }))
          .filter(
            (
              entry,
            ): entry is {
              task: (typeof tasks)[number];
              currentStatus: "BACKLOG" | "SPRINT" | "DONE";
              plan: NonNullable<typeof entry.plan>;
            } => Boolean(entry.plan) && entry.currentStatus !== entry.plan?.status,
          );
        if (changedTasks.length) {
          await recordTaskStatusTransitions(
            tx,
            changedTasks.map(({ task, currentStatus, plan }) => ({
              taskId: task.id,
              taskTitle: task.title,
              fromStatus: currentStatus,
              toStatus: plan.status,
              actorId: actor.userId,
              trigger: "BULK" as const,
              workspaceId: actor.workspaceId,
            })),
          );
        }

        const automationTasks: AutomationTask[] = [];
        for (const { task, plan } of changedTasks) {
          if (plan.createNextRoutineOccurrence) {
            const next = await createNextRoutineOccurrence(tx, {
              task,
              userId: actor.userId,
              workspaceId: actor.workspaceId,
            });
            if (next) automationTasks.push(next);
          }
        }
        for (const automationTask of automationTasks) {
          await enqueueTaskAutomation(tx, {
            task: automationTask,
            workspaceId: actor.workspaceId,
            requestedById: actor.userId,
          });
        }
        await tx.auditLog.create({
          data: {
            actorId: actor.userId,
            action: "TASK_BULK_STATUS",
            targetWorkspaceId: actor.workspaceId,
            metadata: { taskIds, status: executionPlan.requestedStatus },
          },
        });
        return { ok: true, action: "status", updatedCount: taskIds.length };
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
      const updatedTasks = await tx.task.findMany({
        where: { id: { in: taskIds }, workspaceId: actor.workspaceId },
        select: {
          id: true,
          title: true,
          description: true,
          points: true,
          workflowState: true,
          updatedAt: true,
        },
      });
      if (updatedTasks.length !== taskIds.length) {
        throw notFound("one or more updated tasks were not found");
      }
      for (const task of updatedTasks) {
        await enqueueTaskAutomation(tx, {
          task,
          workspaceId: actor.workspaceId,
          requestedById: actor.userId,
        });
      }
      return { ok: true, action: "points", updatedCount: taskIds.length };
    },
    {
      code: "TASK_CONCURRENT_UPDATE",
      message: "tasks changed concurrently; retry the operation",
    },
  );

export const prismaBulkTaskCommandPort: BulkTaskCommandPort = {
  async execute(actor, command, planners) {
    const result = await executeBulkCommand(actor, command, planners);
    wakeTaskAutomationWorker();
    return result;
  },
};
