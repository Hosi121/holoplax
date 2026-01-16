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
  dueDate?: string | Date | null;
  assigneeId?: string | null;
  tags?: string[];
  dependencyIds?: string[];
  dependencies?: { id: string; title: string; status: TaskStatus }[];
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
  status: "ACTIVE" | "CLOSED";
  capacityPoints: number;
  startedAt?: string | Date;
  plannedEndAt?: string | Date | null;
  endedAt?: string | Date | null;
};
