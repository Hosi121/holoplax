import type {
  Severity as PrismaSeverity,
  SprintStatus as PrismaSprintStatus,
  TaskAutomationStatus as PrismaTaskAutomationStatus,
  TaskHierarchyRole as PrismaTaskHierarchyRole,
  TaskOrigin as PrismaTaskOrigin,
  TaskStatus as PrismaTaskStatus,
  TaskType as PrismaTaskType,
  TaskWorkflowState as PrismaTaskWorkflowState,
} from "@prisma/client";
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
} as const satisfies Record<string, PrismaTaskStatus>;

export const TASK_TYPE = {
  EPIC: "EPIC",
  PBI: "PBI",
  TASK: "TASK",
} as const satisfies Record<string, PrismaTaskType>;

export const TASK_WORKFLOW_STATE = {
  READY: "READY",
  IN_PROGRESS: "IN_PROGRESS",
  BLOCKED: "BLOCKED",
  DONE: "DONE",
  CANCELED: "CANCELED",
} as const satisfies Record<string, PrismaTaskWorkflowState>;

export const AUTOMATION_STATUS = {
  NONE: "NONE",
  PREPARED: "PREPARED",
  SPLIT_PENDING: "SPLIT_PENDING",
  SPLIT_REJECTED: "SPLIT_REJECTED",
} as const satisfies Record<string, PrismaTaskAutomationStatus>;

export const TASK_HIERARCHY_ROLE = {
  STANDARD: "STANDARD",
  SPLIT_PARENT: "SPLIT_PARENT",
  SPLIT_CHILD: "SPLIT_CHILD",
} as const satisfies Record<string, PrismaTaskHierarchyRole>;

export const TASK_ORIGIN = {
  MANUAL: "MANUAL",
  INTAKE: "INTAKE",
  AUTOMATION: "AUTOMATION",
  ROUTINE: "ROUTINE",
  ONBOARDING: "ONBOARDING",
} as const satisfies Record<string, PrismaTaskOrigin>;

export const SEVERITY = {
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
} as const satisfies Record<string, PrismaSeverity>;

// Browser-safe enums; type-only Prisma imports still check their values.
export const Severity = SEVERITY;
export type Severity = PrismaSeverity;
export const TaskAutomationStatus = AUTOMATION_STATUS;
export type TaskAutomationStatus = PrismaTaskAutomationStatus;
export const TaskHierarchyRole = TASK_HIERARCHY_ROLE;
export type TaskHierarchyRole = PrismaTaskHierarchyRole;
export const TaskOrigin = TASK_ORIGIN;
export type TaskOrigin = PrismaTaskOrigin;
export const TaskStatus = TASK_STATUS;
export type TaskStatus = PrismaTaskStatus;
export const TaskType = TASK_TYPE;
export type TaskType = PrismaTaskType;
export const TaskWorkflowState = TASK_WORKFLOW_STATE;
export type TaskWorkflowState = PrismaTaskWorkflowState;

/**
 * Labels for display (Japanese)
 */
export const SEVERITY_LABELS: Record<PrismaSeverity, string> = {
  LOW: "低",
  MEDIUM: "中",
  HIGH: "高",
};

/**
 * Reverse mapping for parsing Japanese input
 */
export const SEVERITY_FROM_LABEL: Record<string, PrismaSeverity> = {
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
  status: PrismaSprintStatus;
  capacityPoints: number;
  startedAt?: string | Date;
  plannedEndAt?: string | Date | null;
  endedAt?: string | Date | null;
  committedPoints?: number;
  activePoints?: number;
  completedPoints?: number;
};
