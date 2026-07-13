import type { Severity, TaskStatus, TaskType } from "../domain/task-types";
import type { TaskView } from "./task-view";

export type TaskListFilters = {
  statuses?: TaskStatus[];
  types?: TaskType[];
  urgency?: Severity;
  risk?: Severity;
  tags?: string[];
  assigneeId?: string;
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

export interface TaskQueryPort {
  list(workspaceId: string, filters?: TaskListFilters): Promise<TaskListResult>;
  get(workspaceId: string, taskId: string): Promise<TaskView | null>;
}

export const createTaskQueries = (port: TaskQueryPort) => ({
  list: (workspaceId: string, filters?: TaskListFilters) => port.list(workspaceId, filters),
  get: (workspaceId: string, taskId: string) => port.get(workspaceId, taskId),
});
