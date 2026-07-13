import type { TaskAutomationState, TaskDTO, TaskStatus } from "../types";

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

export const mapTaskWithDependencies = (task: TaskWithDeps): TaskDTO => {
  const dependencyIds = task.dependencies.map((dep) => dep.dependsOnId);
  const dependencies = task.dependencies
    .map((dep) => dep.dependsOn)
    .filter((dep): dep is { id: string; title: string; status: TaskStatus } => Boolean(dep));
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    definitionOfDone: task.definitionOfDone ?? undefined,
    checklist: task.checklist as TaskDTO["checklist"],
    points: task.points as TaskDTO["points"],
    urgency: task.urgency as TaskDTO["urgency"],
    risk: task.risk as TaskDTO["risk"],
    status: task.status,
    type: (task.type ?? undefined) as TaskDTO["type"],
    automationState: (task.automationState ?? undefined) as TaskDTO["automationState"],
    parentId: task.parentId,
    dueDate: task.dueDate,
    assigneeId: task.assigneeId,
    tags: task.tags,
    sprintId: task.sprintId,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    dependencyIds,
    dependencies,
    routineCadence: (task.routineRule?.cadence ?? null) as TaskDTO["routineCadence"],
    routineNextAt: task.routineRule?.nextAt ?? null,
  };
};
