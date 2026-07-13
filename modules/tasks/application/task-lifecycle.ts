import { findTaskPolicyViolation, type TaskPolicyInput } from "../domain/task-policy";
import type { TaskStatus, TaskWorkflowState } from "../domain/task-types";
import {
  conflictingLifecycleRequest,
  nextWorkflowState,
  projectLegacyStatus,
} from "../domain/task-workflow";

export type TaskLifecyclePlan = {
  status: TaskStatus;
  workflowState: TaskWorkflowState;
  violation: string | null;
};

/**
 * Application-level lifecycle planner shared by single and bulk commands.
 * Persistence adapters supply facts; this use case owns the transition and
 * policy decision so command paths cannot invent different lifecycle rules.
 */
export const planTaskLifecycleUpdate = (input: {
  currentStatus: TaskStatus;
  currentWorkflowState: TaskWorkflowState;
  requestedStatus?: TaskStatus | null;
  requestedWorkflowState?: TaskWorkflowState;
  policy: Omit<TaskPolicyInput, "status" | "workflowState">;
}): TaskLifecyclePlan => {
  if (
    conflictingLifecycleRequest({
      status: input.requestedStatus ?? undefined,
      workflowState: input.requestedWorkflowState,
    })
  ) {
    return {
      status: input.currentStatus,
      workflowState: input.currentWorkflowState,
      violation: "status and workflowState describe conflicting lifecycle states",
    };
  }
  const workflowState = nextWorkflowState({
    current: input.currentWorkflowState,
    requestedStatus: input.requestedStatus,
    requestedWorkflowState: input.requestedWorkflowState,
  });
  const status = projectLegacyStatus({
    current: input.currentStatus,
    requestedStatus: input.requestedStatus,
    workflowState,
  });
  return {
    status,
    workflowState,
    violation: findTaskPolicyViolation({ ...input.policy, status, workflowState }),
  };
};
