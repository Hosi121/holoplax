import type {
  Severity as DbSeverity,
  SprintStatus as DbSprintStatus,
  TaskAutomationStatus as DbTaskAutomationStatus,
  TaskHierarchyRole as DbTaskHierarchyRole,
  TaskOrigin as DbTaskOrigin,
  TaskStatus as DbTaskStatus,
  TaskType as DbTaskType,
  TaskWorkflowState as DbTaskWorkflowState,
} from "../database/models";
import type { TaskView } from "../modules/tasks";
import type { TaskAutomationState as DomainTaskAutomationState } from "../modules/tasks/domain/task-types";

export type TaskAutomationState = DomainTaskAutomationState;

/**
 * Runtime constants for enum values
 * Use these for comparisons and iterations
 */
export const TASK_STATUS = {
  BACKLOG: "BACKLOG",
  SPRINT: "SPRINT",
  DONE: "DONE",
} as const satisfies Record<string, DbTaskStatus>;

export const TASK_TYPE = {
  EPIC: "EPIC",
  PBI: "PBI",
  TASK: "TASK",
} as const satisfies Record<string, DbTaskType>;

export const TASK_WORKFLOW_STATE = {
  READY: "READY",
  IN_PROGRESS: "IN_PROGRESS",
  BLOCKED: "BLOCKED",
  DONE: "DONE",
  CANCELED: "CANCELED",
} as const satisfies Record<string, DbTaskWorkflowState>;

export const AUTOMATION_STATUS = {
  NONE: "NONE",
  PREPARED: "PREPARED",
  SPLIT_PENDING: "SPLIT_PENDING",
  SPLIT_REJECTED: "SPLIT_REJECTED",
} as const satisfies Record<string, DbTaskAutomationStatus>;

export const TASK_HIERARCHY_ROLE = {
  STANDARD: "STANDARD",
  SPLIT_PARENT: "SPLIT_PARENT",
  SPLIT_CHILD: "SPLIT_CHILD",
} as const satisfies Record<string, DbTaskHierarchyRole>;

export const TASK_ORIGIN = {
  MANUAL: "MANUAL",
  INTAKE: "INTAKE",
  AUTOMATION: "AUTOMATION",
  ROUTINE: "ROUTINE",
  ONBOARDING: "ONBOARDING",
} as const satisfies Record<string, DbTaskOrigin>;

export const SEVERITY = {
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
} as const satisfies Record<string, DbSeverity>;

// Browser-safe enums; type-only Db imports still check their values.
export const Severity = SEVERITY;
export type Severity = DbSeverity;
export const TaskAutomationStatus = AUTOMATION_STATUS;
export type TaskAutomationStatus = DbTaskAutomationStatus;
export const TaskHierarchyRole = TASK_HIERARCHY_ROLE;
export type TaskHierarchyRole = DbTaskHierarchyRole;
export const TaskOrigin = TASK_ORIGIN;
export type TaskOrigin = DbTaskOrigin;
export const TaskStatus = TASK_STATUS;
export type TaskStatus = DbTaskStatus;
export const TaskType = TASK_TYPE;
export type TaskType = DbTaskType;
export const TaskWorkflowState = TASK_WORKFLOW_STATE;
export type TaskWorkflowState = DbTaskWorkflowState;

/**
 * Labels for display (Japanese)
 */
export const SEVERITY_LABELS: Record<DbSeverity, string> = {
  LOW: "低",
  MEDIUM: "中",
  HIGH: "高",
};

/**
 * Reverse mapping for parsing Japanese input
 */
export const SEVERITY_FROM_LABEL: Record<string, DbSeverity> = {
  低: "LOW",
  中: "MEDIUM",
  高: "HIGH",
};

/**
 * DTO types for API responses
 * These represent the shape of data sent to/from the API
 */
export type TaskDTO = TaskView;

export type VelocityEntryDTO = {
  id: string;
  name: string;
  points: number;
  range: string;
  createdAt?: string | Date;
};

export type AutomationSettingDTO = {
  low: number;
  high: number;
  stage?: number;
  effectiveLow?: number;
  effectiveHigh?: number;
};

export type SprintDTO = {
  id: string;
  name: string;
  status: DbSprintStatus;
  capacityPoints: number;
  startedAt?: string | Date;
  plannedEndAt?: string | Date | null;
  endedAt?: string | Date | null;
  committedPoints?: number;
  activePoints?: number;
  completedPoints?: number;
};
