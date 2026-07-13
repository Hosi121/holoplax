import type {
  Severity,
  StoryPoint,
  TaskAutomationState,
  TaskAutomationStatus,
  TaskHierarchyRole,
  TaskOrigin,
  TaskStatus,
  TaskType,
  TaskWorkflowState,
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
  workflowState: TaskWorkflowState;
  planningState: "BACKLOG" | "COMMITTED";
  type?: TaskType;
  automationState?: TaskAutomationState;
  automationStatus: TaskAutomationStatus;
  hierarchyRole: TaskHierarchyRole;
  origin: TaskOrigin;
  routineCadence?: "DAILY" | "WEEKLY" | null;
  routineNextAt?: string | Date | null;
  parentId?: string | null;
  childCount?: number;
  dueDate?: string | Date | null;
  assigneeId?: string | null;
  sprintId?: string | null;
  tags?: string[];
  dependencyIds?: string[];
  dependencies?: {
    id: string;
    title: string;
    status: TaskStatus;
    workflowState: TaskWorkflowState;
  }[];
  createdAt?: string | Date;
  updatedAt?: string | Date;
};
