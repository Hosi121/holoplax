import type { Severity, TaskStatus, TaskType, TaskWorkflowState } from "../domain/task-types";
import type { TaskView } from "./task-view";

export type TaskListFilters = {
  statuses?: TaskStatus[];
  workflowStates?: TaskWorkflowState[];
  types?: TaskType[];
  urgency?: Severity;
  risk?: Severity;
  tags?: string[];
  assigneeId?: string;
  sprintId?: string;
  dueBefore?: Date;
  dueAfter?: Date;
  minPoints?: number;
  maxPoints?: number;
  search?: string;
  limit?: number;
  cursor?: string;
  page?: number;
};

export type TaskListResult = {
  tasks: TaskView[];
  nextCursor: string | null;
  hasMore: boolean;
  page?: number;
};
