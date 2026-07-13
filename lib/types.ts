/**
 * Re-export Prisma enum types for consistency
 * These are the source of truth for enum values
 */
export {
  Severity,
  TaskAutomationState,
  TaskAutomationStatus,
  TaskHierarchyRole,
  TaskOrigin,
  TaskStatus,
  TaskType,
  TaskWorkflowState,
} from "@prisma/client";

import type {
  Severity as PrismaSeverity,
  SprintStatus as PrismaSprintStatus,
  TaskAutomationState as PrismaTaskAutomationState,
  TaskAutomationStatus as PrismaTaskAutomationStatus,
  TaskHierarchyRole as PrismaTaskHierarchyRole,
  TaskOrigin as PrismaTaskOrigin,
  TaskStatus as PrismaTaskStatus,
  TaskType as PrismaTaskType,
  TaskWorkflowState as PrismaTaskWorkflowState,
} from "@prisma/client";
import type { TaskView } from "../modules/tasks";

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

export const AUTOMATION_STATE = {
  NONE: "NONE",
  DELEGATED: "DELEGATED",
  PENDING_SPLIT: "PENDING_SPLIT",
  SPLIT_PARENT: "SPLIT_PARENT",
  SPLIT_CHILD: "SPLIT_CHILD",
  SPLIT_REJECTED: "SPLIT_REJECTED",
} as const satisfies Record<string, PrismaTaskAutomationState>;

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
