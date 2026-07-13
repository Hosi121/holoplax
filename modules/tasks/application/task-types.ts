import type {
  Severity,
  StoryPoint,
  TaskAutomationState,
  TaskStatus,
  TaskType,
} from "../domain/task-types";

export type TaskChecklistItemInput = {
  id?: string;
  text?: string;
  done?: boolean;
};

export type CreateTaskInput = {
  title: string;
  description?: string;
  definitionOfDone?: string;
  checklist?: TaskChecklistItemInput[] | null;
  points: StoryPoint;
  urgency?: Severity;
  risk?: Severity;
  status?: TaskStatus;
  type?: TaskType;
  parentId?: string | null;
  dueDate?: string | null;
  assigneeId?: string | null;
  tags?: string[];
  dependencyIds?: string[];
  routineCadence?: string | null;
  routineNextAt?: string | null;
};

export type UpdateTaskInput = Omit<Partial<CreateTaskInput>, "points"> & {
  points?: StoryPoint;
};

export type TaskRecord = {
  id: string;
  title: string;
  description: string;
  definitionOfDone: string;
  checklist: unknown;
  points: number;
  urgency: Severity;
  risk: Severity;
  status: TaskStatus;
  type: TaskType;
  automationState: TaskAutomationState;
  parentId: string | null;
  sprintId: string | null;
  dueDate: Date | null;
  assigneeId: string | null;
  tags: string[];
  userId: string;
  workspaceId: string;
  createdAt: Date;
  updatedAt: Date;
};

export type TaskActor = {
  userId: string;
  workspaceId: string;
};
