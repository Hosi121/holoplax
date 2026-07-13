import type {
  Severity as SeverityType,
  StoryPoint as StoryPointType,
  TaskAutomationState as TaskAutomationStateType,
  TaskStatus as TaskStatusType,
  TaskType as TaskTypeType,
} from "./domain/task-types";

export type Severity = SeverityType;
export type StoryPoint = StoryPointType;
export type TaskAutomationState = TaskAutomationStateType;
export type TaskStatus = TaskStatusType;
export type TaskType = TaskTypeType;

export type RoutineCadence = "DAILY" | "WEEKLY";

export const Severity = { LOW: "LOW", MEDIUM: "MEDIUM", HIGH: "HIGH" } as const;
export const TaskStatus = { BACKLOG: "BACKLOG", SPRINT: "SPRINT", DONE: "DONE" } as const;
export const TaskType = { EPIC: "EPIC", PBI: "PBI", TASK: "TASK" } as const;
export const RoutineCadence = { DAILY: "DAILY", WEEKLY: "WEEKLY" } as const;
