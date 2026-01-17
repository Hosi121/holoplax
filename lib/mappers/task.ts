import { TaskStatus, TASK_STATUS } from "../types";

type DepNode = {
  dependsOnId: string;
  dependsOn?: { id: string; title: string; status: TaskStatus } | null;
};

type TaskWithDeps<T extends DepNode = DepNode> = {
  id: string;
  title: string;
  description: string;
  points: number;
  urgency: string;
  risk: string;
  status: TaskStatus;
  type?: string | null;
  parentId?: string | null;
  dueDate: Date | null;
  assigneeId: string | null;
  tags: string[];
  sprintId?: string | null;
  dependencies: T[];
  createdAt?: Date;
  updatedAt?: Date;
};

export const mapTaskWithDependencies = (task: TaskWithDeps) => {
  const dependencyIds = task.dependencies.map((dep) => dep.dependsOnId);
  const dependencies = task.dependencies
    .map((dep) => dep.dependsOn)
    .filter((dep): dep is { id: string; title: string; status: TaskStatus } => Boolean(dep));
  return { ...task, dependencyIds, dependencies };
};

export const hasOpenDependencies = (task: TaskWithDeps) =>
  (task.dependencies ?? []).some((dep) => dep.dependsOn?.status !== TASK_STATUS.DONE);
