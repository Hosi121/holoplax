export type TaskPolicyStatus = "BACKLOG" | "SPRINT" | "DONE";
export type TaskPolicyType = "EPIC" | "PBI" | "TASK";

export type TaskPolicyInput = {
  type: TaskPolicyType;
  status: TaskPolicyStatus;
  checklist?: unknown;
  hasUnresolvedDependencies?: boolean;
};

/**
 * Pure task invariant evaluation. This module intentionally has no Prisma,
 * HTTP, Zod, or framework dependency so every command path can share it.
 */
export function findTaskPolicyViolation(input: TaskPolicyInput): string | null {
  if (input.type === "EPIC" && input.status !== "BACKLOG") {
    return "epics must remain in backlog";
  }
  if (
    input.status === "DONE" &&
    Array.isArray(input.checklist) &&
    input.checklist.some(
      (item) => item && typeof item === "object" && !(item as Record<string, unknown>).done,
    )
  ) {
    return "all checklist items must be complete before moving to done";
  }
  if (input.status !== "BACKLOG" && input.hasUnresolvedDependencies) {
    return "dependencies must be done before moving";
  }
  return null;
}
