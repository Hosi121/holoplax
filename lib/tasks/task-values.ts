import type { Severity, TaskStatus, TaskType, TaskWorkflowState } from "@prisma/client";
import { SEVERITY, TASK_STATUS, TASK_TYPE, TASK_WORKFLOW_STATE } from "../types";

export const isTaskStatus = (value: unknown): value is TaskStatus =>
  Object.values(TASK_STATUS).includes(value as TaskStatus);

export const isTaskType = (value: unknown): value is TaskType =>
  Object.values(TASK_TYPE).includes(value as TaskType);

export const isSeverity = (value: unknown): value is Severity =>
  Object.values(SEVERITY).includes(value as Severity);

export const isTaskWorkflowState = (value: unknown): value is TaskWorkflowState =>
  Object.values(TASK_WORKFLOW_STATE).includes(value as TaskWorkflowState);
