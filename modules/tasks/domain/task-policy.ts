export type TaskPolicyStatus = "BACKLOG" | "SPRINT" | "DONE";
export type TaskPolicyType = "EPIC" | "PBI" | "TASK";
export type TaskPolicyWorkflowState = "READY" | "IN_PROGRESS" | "BLOCKED" | "DONE" | "CANCELED";

export type TaskPolicyInput = {
  type: TaskPolicyType;
  status: TaskPolicyStatus;
  workflowState?: TaskPolicyWorkflowState;
  checklist?: unknown;
  hasUnresolvedDependencies?: boolean;
  hasIncompleteChildren?: boolean;
};

/**
 * Pure task invariant evaluation. This module intentionally has no Prisma,
 * HTTP, Zod, or framework dependency so every command path can share it.
 */
export function findTaskPolicyViolation(input: TaskPolicyInput): string | null {
  if (input.type === "EPIC" && input.status === "SPRINT") {
    return "epics cannot be committed directly to a sprint";
  }
  const isDone = input.workflowState === "DONE" || input.status === "DONE";
  if (
    isDone &&
    Array.isArray(input.checklist) &&
    input.checklist.some(
      (item) => item && typeof item === "object" && !(item as Record<string, unknown>).done,
    )
  ) {
    return "all checklist items must be complete before moving to done";
  }
  if (isDone && input.hasIncompleteChildren) {
    return "all child work items must be done before completing the parent";
  }
  const hasStarted =
    input.workflowState === "IN_PROGRESS" ||
    input.workflowState === "BLOCKED" ||
    input.workflowState === "DONE" ||
    input.status === "DONE";
  if (hasStarted && input.hasUnresolvedDependencies) {
    return "dependencies must be done before moving";
  }
  return null;
}

export function findTaskHierarchyViolation(input: {
  type: TaskPolicyType;
  parentType?: TaskPolicyType | null;
  childTypes?: TaskPolicyType[];
}): string | null {
  if (input.type === "EPIC" && input.parentType) return "epics cannot have a parent";
  if (input.type === "PBI" && input.parentType && input.parentType !== "EPIC") {
    return "a PBI parent must be an epic";
  }
  if (input.type === "TASK" && input.parentType === "EPIC") {
    return "a task cannot be placed directly under an epic";
  }
  if (input.type === "EPIC" && input.childTypes?.some((type) => type !== "PBI")) {
    return "epics may contain only PBIs";
  }
  if (input.type === "PBI" && input.childTypes?.some((type) => type !== "TASK")) {
    return "PBIs may contain only tasks";
  }
  return null;
}
