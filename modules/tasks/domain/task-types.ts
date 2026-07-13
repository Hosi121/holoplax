export type TaskStatus = "BACKLOG" | "SPRINT" | "DONE";
export type TaskWorkflowState = "READY" | "IN_PROGRESS" | "BLOCKED" | "DONE" | "CANCELED";
export type TaskType = "EPIC" | "PBI" | "TASK";
export type Severity = "LOW" | "MEDIUM" | "HIGH";
export type StoryPoint = 1 | 2 | 3 | 5 | 8 | 13 | 21 | 34;
export type TaskAutomationState =
  | "NONE"
  | "DELEGATED"
  | "PENDING_SPLIT"
  | "SPLIT_PARENT"
  | "SPLIT_CHILD"
  | "SPLIT_REJECTED";
export type TaskAutomationStatus = "NONE" | "PREPARED" | "SPLIT_PENDING" | "SPLIT_REJECTED";
export type TaskHierarchyRole = "STANDARD" | "SPLIT_PARENT" | "SPLIT_CHILD";
export type TaskOrigin = "MANUAL" | "INTAKE" | "AUTOMATION" | "ROUTINE" | "ONBOARDING";
