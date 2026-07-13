import type { TaskStatus, TaskType } from "@prisma/client";
import { TASK_STATUS, TASK_TYPE } from "./types";

/** User-facing language. Internal API/DB enum names must not leak into the UI. */
export const NAV_LABELS = {
  backlog: "やること",
  sprint: "スプリント",
  review: "振り返り",
  kanban: "進捗ボード",
  velocity: "完了ペース",
  intake: "受信箱",
  automation: "AI自動化",
} as const;

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  [TASK_TYPE.EPIC]: "目標",
  [TASK_TYPE.PBI]: "やること",
  [TASK_TYPE.TASK]: "作業",
};

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  [TASK_STATUS.BACKLOG]: "やること",
  [TASK_STATUS.SPRINT]: "スプリント",
  [TASK_STATUS.DONE]: "完了",
};

export const PRODUCT_COPY = {
  workspace: "ワークスペース",
  points: "大きさ",
  completionCriteria: "完了条件",
  capacity: "上限ポイント",
  focus: "優先候補",
  routine: "繰り返し",
  aiDelegation: "AIに任せる",
  taskSplit: "分割",
} as const;
