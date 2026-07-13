import type {
  Severity,
  StoryPoint,
  TaskAutomationState,
  TaskStatus,
  TaskType,
} from "../domain/task-types";

export type TaskView = {
  id: string;
  title: string;
  description?: string;
  definitionOfDone?: string;
  checklist?: { id: string; text: string; done: boolean }[] | null;
  points: StoryPoint;
  urgency: Severity;
  risk: Severity;
  status: TaskStatus;
  type?: TaskType;
  automationState?: TaskAutomationState;
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
