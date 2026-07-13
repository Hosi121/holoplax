import type { TaskAutomationState, TaskAutomationStatus, TaskHierarchyRole } from "./task-types";

export const projectLegacyAutomationState = (input: {
  automationStatus: TaskAutomationStatus;
  hierarchyRole: TaskHierarchyRole;
}): TaskAutomationState => {
  if (input.hierarchyRole === "SPLIT_PARENT") return "SPLIT_PARENT";
  if (input.hierarchyRole === "SPLIT_CHILD") return "SPLIT_CHILD";
  if (input.automationStatus === "PREPARED") return "DELEGATED";
  if (input.automationStatus === "SPLIT_PENDING") return "PENDING_SPLIT";
  if (input.automationStatus === "SPLIT_REJECTED") return "SPLIT_REJECTED";
  return "NONE";
};
