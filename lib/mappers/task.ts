import { TASK_STATUS, type TaskAutomationState, type TaskStatus } from "../types";

type DepNode = {
  dependsOnId: string;
  dependsOn?: { id: string; title: string; status: TaskStatus } | null;
};

type TaskWithDeps<T extends DepNode = DepNode> = {
  id: string;
  title: string;
  description: string;
  definitionOfDone?: string | null;
  checklist?: unknown | null;
  points: number;
  urgency: string;
  risk: string;
  status: TaskStatus;
  type?: string | null;
  automationState?: TaskAutomationState | null;
  routineRule?: { cadence: string; nextAt: Date } | null;
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
  return {
    ...task,
    dependencyIds,
    dependencies,
    routineCadence: task.routineRule?.cadence ?? null,
    routineNextAt: task.routineRule?.nextAt ?? null,
  };
};

export const hasOpenDependencies = (task: TaskWithDeps) =>
  (task.dependencies ?? []).some((dep) => dep.dependsOn?.status !== TASK_STATUS.DONE);
