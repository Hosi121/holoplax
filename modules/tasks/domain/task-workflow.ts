import type { TaskStatus, TaskWorkflowState } from "./task-types";

/**
 * Compatibility projection for clients that still speak the old TaskStatus
 * vocabulary. Current state is stored only as workflowState + active sprint
 * membership; callers must never persist this result back to Task.
 */
export const deriveLegacyStatus = (input: {
  workflowState: TaskWorkflowState;
  isInActiveSprint: boolean;
}): TaskStatus => {
  if (input.workflowState === "DONE") return "DONE";
  return input.isInActiveSprint ? "SPRINT" : "BACKLOG";
};

export const initialWorkflowState = (
  status: TaskStatus,
  requested?: TaskWorkflowState,
): TaskWorkflowState => requested ?? (status === "DONE" ? "DONE" : "READY");

export const nextWorkflowState = (input: {
  current: TaskWorkflowState;
  requestedStatus?: TaskStatus | null;
  requestedWorkflowState?: TaskWorkflowState;
}): TaskWorkflowState => {
  if (input.requestedWorkflowState) return input.requestedWorkflowState;
  if (input.requestedStatus === "DONE") return "DONE";
  if (input.requestedStatus && (input.current === "DONE" || input.current === "CANCELED")) {
    return "READY";
  }
  return input.current;
};

export const projectLegacyStatus = (input: {
  current: TaskStatus;
  requestedStatus?: TaskStatus | null;
  workflowState: TaskWorkflowState;
}): TaskStatus => {
  if (input.workflowState === "DONE") return "DONE";
  if (input.workflowState === "CANCELED") return "BACKLOG";
  if (input.requestedStatus && input.requestedStatus !== "DONE") return input.requestedStatus;
  return input.current === "DONE" ? "BACKLOG" : input.current;
};

export const conflictingLifecycleRequest = (input: {
  status?: TaskStatus;
  workflowState?: TaskWorkflowState;
}) =>
  (input.status === "DONE" &&
    input.workflowState !== undefined &&
    input.workflowState !== "DONE") ||
  (input.workflowState === "DONE" && input.status !== undefined && input.status !== "DONE") ||
  (input.workflowState === "CANCELED" && input.status !== undefined && input.status !== "BACKLOG");
