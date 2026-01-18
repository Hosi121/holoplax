export const TASK_STATUS = {
  BACKLOG: "BACKLOG",
  SPRINT: "SPRINT",
  DONE: "DONE",
} as const;

export type TaskStatus = (typeof TASK_STATUS)[keyof typeof TASK_STATUS];

export const TASK_TYPE = {
  EPIC: "EPIC",
  PBI: "PBI",
  TASK: "TASK",
  ROUTINE: "ROUTINE",
} as const;

export type TaskType = (typeof TASK_TYPE)[keyof typeof TASK_TYPE];

export type TaskDTO = {
  id: string;
  title: string;
  description?: string;
  definitionOfDone?: string;
  checklist?: { id: string; text: string; done: boolean }[] | null;
  points: 1 | 2 | 3 | 5 | 8 | 13 | 21 | 34;
  urgency: string;
  risk: string;
  status: TaskStatus;
  type?: TaskType;
  routineCadence?: "DAILY" | "WEEKLY" | null;
  routineNextAt?: string | Date | null;
  parentId?: string | null;
  dueDate?: string | Date | null;
  assigneeId?: string | null;
  sprintId?: string | null;
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
  status: "ACTIVE" | "CLOSED";
  capacityPoints: number;
  startedAt?: string | Date;
  plannedEndAt?: string | Date | null;
  endedAt?: string | Date | null;
};
