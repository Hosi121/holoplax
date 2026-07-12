import { RoutineCadence, Severity, SprintStatus, TaskStatus, TaskType } from "@prisma/client";

// Prisma is the source of truth for enum values. Keeping these aliases in one
// module prevents MCP input schemas and services from drifting from the DB.
export { RoutineCadence, Severity, SprintStatus, TaskStatus, TaskType };
export const SEVERITY = Severity;
export const SPRINT_STATUS = SprintStatus;
export const TASK_STATUS = TaskStatus;
export const TASK_TYPE = TaskType;

export const SEVERITY_VALUES = Object.values(Severity) as [Severity, ...Severity[]];
export const ROUTINE_CADENCE_VALUES = Object.values(RoutineCadence) as [
  RoutineCadence,
  ...RoutineCadence[],
];
export const SPRINT_STATUS_VALUES = Object.values(SprintStatus) as [
  SprintStatus,
  ...SprintStatus[],
];
export const TASK_STATUS_VALUES = Object.values(TaskStatus) as [TaskStatus, ...TaskStatus[]];
export const TASK_TYPE_VALUES = Object.values(TaskType) as [TaskType, ...TaskType[]];

export const STORY_POINTS = [1, 2, 3, 5, 8, 13, 21, 34] as const;
export type StoryPoint = (typeof STORY_POINTS)[number];

export function isStoryPoint(value: unknown): value is StoryPoint {
  return typeof value === "number" && STORY_POINTS.includes(value as StoryPoint);
}

export function isValidDateString(value: string): boolean {
  return !Number.isNaN(new Date(value).getTime());
}
