/**
 * Re-export Prisma enum types for consistency
 * These are the source of truth for enum values
 */
export {
  AutomationState,
  Severity,
  SprintStatus,
  TaskStatus,
  TaskType,
} from "@prisma/client";

import type {
  AutomationState as PrismaAutomationState,
  Severity as PrismaSeverity,
  SprintStatus as PrismaSprintStatus,
  TaskStatus as PrismaTaskStatus,
  TaskType as PrismaTaskType,
} from "@prisma/client";

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
  ROUTINE: "ROUTINE",
} as const satisfies Record<string, PrismaTaskType>;

export const AUTOMATION_STATE = {
  NONE: "NONE",
  DELEGATED: "DELEGATED",
  PENDING_SPLIT: "PENDING_SPLIT",
  SPLIT_PARENT: "SPLIT_PARENT",
  SPLIT_CHILD: "SPLIT_CHILD",
  SPLIT_REJECTED: "SPLIT_REJECTED",
} as const satisfies Record<string, PrismaAutomationState>;

export const SEVERITY = {
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
} as const satisfies Record<string, PrismaSeverity>;

export const SPRINT_STATUS = {
  ACTIVE: "ACTIVE",
  CLOSED: "CLOSED",
} as const satisfies Record<string, PrismaSprintStatus>;

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
export type TaskDTO = {
  id: string;
  title: string;
  description?: string;
  definitionOfDone?: string;
  checklist?: { id: string; text: string; done: boolean }[] | null;
  points: 1 | 2 | 3 | 5 | 8 | 13 | 21 | 34;
  urgency: PrismaSeverity;
  risk: PrismaSeverity;
  status: PrismaTaskStatus;
  type?: PrismaTaskType;
  automationState?: PrismaAutomationState;
  routineCadence?: "DAILY" | "WEEKLY" | null;
  routineNextAt?: string | Date | null;
  parentId?: string | null;
  dueDate?: string | Date | null;
  assigneeId?: string | null;
  sprintId?: string | null;
  tags?: string[];
  dependencyIds?: string[];
  dependencies?: { id: string; title: string; status: PrismaTaskStatus }[];
  createdAt?: string | Date;
  updatedAt?: string | Date;
};

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

export type AiSuggestionDTO = {
  id: string;
  type: "TIP" | "SCORE" | "SPLIT";
  taskId?: string | null;
  inputTitle: string;
  inputDescription: string;
  output: string;
  createdAt?: string | Date;
};

export type SprintDTO = {
  id: string;
  name: string;
  status: PrismaSprintStatus;
  capacityPoints: number;
  startedAt?: string | Date;
  plannedEndAt?: string | Date | null;
  endedAt?: string | Date | null;
};
