import type { StoryPoint, TaskStatus, TaskType, TaskWorkflowState } from "../domain/task-types";
import { planTaskLifecycleUpdate } from "./task-lifecycle";
import type { TaskActor } from "./task-types";

export type BulkTaskCommand = {
  action: "status" | "delete" | "points";
  taskIds: string[];
  status?: TaskStatus;
  points?: StoryPoint;
};

export type BulkTaskResult = {
  ok: true;
  action: BulkTaskCommand["action"];
  updatedCount?: number;
  deletedCount?: number;
};

export type BulkStatusTaskFacts = {
  id: string;
  status: TaskStatus;
  workflowState: TaskWorkflowState;
  type: TaskType;
  checklist: unknown;
  dependencies: Array<{ id: string; workflowState: TaskWorkflowState }>;
  children: Array<{ workflowState: TaskWorkflowState }>;
};

export type BulkStatusTaskPlan = {
  taskId: string;
  status: TaskStatus;
  workflowState: TaskWorkflowState;
  planningAction: "COMMIT" | "REMOVE" | "COMPLETE" | "NONE";
  createNextRoutineOccurrence: boolean;
};

export type BulkStatusExecutionPlan =
  | { ok: false; violation: string }
  | {
      ok: true;
      requestedStatus: TaskStatus;
      tasks: BulkStatusTaskPlan[];
      requiresActiveSprint: boolean;
    };

/**
 * Pure application plan for a bulk lifecycle command. Persistence adapters may
 * enrich this with an active sprint id, but must persist these projected
 * lifecycle values rather than reconstructing them from the request.
 */
export const planBulkStatusExecution = (input: {
  requestedStatus: TaskStatus;
  tasks: BulkStatusTaskFacts[];
}): BulkStatusExecutionPlan => {
  const selectedIds = new Set(input.tasks.map(({ id }) => id));
  const plans: BulkStatusTaskPlan[] = [];
  for (const task of input.tasks) {
    const lifecycle = planTaskLifecycleUpdate({
      currentStatus: task.status,
      currentWorkflowState: task.workflowState,
      requestedStatus: input.requestedStatus,
      policy: {
        type: task.type,
        checklist: task.checklist,
        hasUnresolvedDependencies: task.dependencies.some(
          (dependency) =>
            dependency.workflowState !== "DONE" &&
            !(input.requestedStatus === "DONE" && selectedIds.has(dependency.id)),
        ),
        hasIncompleteChildren: task.children.some(
          (child) => child.workflowState !== "DONE" && child.workflowState !== "CANCELED",
        ),
      },
    });
    if (lifecycle.violation) return { ok: false, violation: lifecycle.violation };
    if (input.requestedStatus === "SPRINT" && task.children.length > 0) {
      return { ok: false, violation: "only leaf work items can be committed to a sprint" };
    }
    plans.push({
      taskId: task.id,
      status: lifecycle.status,
      workflowState: lifecycle.workflowState,
      planningAction:
        input.requestedStatus === "SPRINT"
          ? "COMMIT"
          : input.requestedStatus === "BACKLOG"
            ? "REMOVE"
            : lifecycle.workflowState === "DONE"
              ? "COMPLETE"
              : "NONE",
      createNextRoutineOccurrence:
        task.workflowState !== "DONE" && lifecycle.workflowState === "DONE",
    });
  }
  return {
    ok: true,
    requestedStatus: input.requestedStatus,
    tasks: plans,
    requiresActiveSprint: input.requestedStatus === "SPRINT",
  };
};

export type BulkTaskPlanners = {
  planStatus: typeof planBulkStatusExecution;
};

export interface BulkTaskCommandPort {
  execute(
    actor: TaskActor,
    command: BulkTaskCommand,
    planners: BulkTaskPlanners,
  ): Promise<BulkTaskResult>;
}

export const createBulkTaskCommand =
  (port: BulkTaskCommandPort) => (actor: TaskActor, command: BulkTaskCommand) =>
    port.execute(actor, command, { planStatus: planBulkStatusExecution });
