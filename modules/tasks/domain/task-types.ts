export type TaskStatus = "BACKLOG" | "SPRINT" | "DONE";
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
