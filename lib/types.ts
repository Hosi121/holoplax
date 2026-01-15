export const TASK_STATUS = {
  BACKLOG: "BACKLOG",
  SPRINT: "SPRINT",
  DONE: "DONE",
} as const;

export type TaskStatus = (typeof TASK_STATUS)[keyof typeof TASK_STATUS];

export type TaskDTO = {
  id: string;
  title: string;
  description?: string;
  points: number;
  urgency: string;
  risk: string;
  status: TaskStatus;
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
};
