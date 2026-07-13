import type { TaskView } from "../../modules/tasks";
import type {
  TaskAutomationState,
  TaskAutomationStatus,
  TaskHierarchyRole,
  TaskOrigin,
  TaskStatus,
  TaskWorkflowState,
} from "../types";

type DepNode = {
  dependsOnId: string;
  dependsOn?: {
    id: string;
    title: string;
    status: TaskStatus;
    workflowState: TaskWorkflowState;
  } | null;
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
  workflowState: TaskView["workflowState"];
  type?: string | null;
  automationState?: TaskAutomationState | null;
  automationStatus: TaskAutomationStatus;
  hierarchyRole: TaskHierarchyRole;
  origin: TaskOrigin;
  routineRule?: { cadence: string; nextAt: Date } | null;
  parentId?: string | null;
  _count?: { children: number };
  dueDate: Date | null;
  assigneeId: string | null;
  tags: string[];
  sprintId?: string | null;
  sprint?: { status: "ACTIVE" | "CLOSED" } | null;
  dependencies: T[];
  createdAt?: Date;
  updatedAt?: Date;
};

export const mapTaskWithDependencies = (task: TaskWithDeps): TaskView => {
  const dependencyIds = task.dependencies.map((dep) => dep.dependsOnId);
  const dependencies = task.dependencies
    .map((dep) => dep.dependsOn)
    .filter(
      (
        dep,
      ): dep is {
        id: string;
        title: string;
        status: TaskStatus;
        workflowState: TaskWorkflowState;
      } => Boolean(dep),
    );
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    definitionOfDone: task.definitionOfDone ?? undefined,
    checklist: task.checklist as TaskView["checklist"],
    points: task.points as TaskView["points"],
    urgency: task.urgency as TaskView["urgency"],
    risk: task.risk as TaskView["risk"],
    status: task.status,
    workflowState: task.workflowState,
    planningState: task.sprint?.status === "ACTIVE" ? "COMMITTED" : "BACKLOG",
    type: (task.type ?? undefined) as TaskView["type"],
    automationState: (task.automationState ?? undefined) as TaskView["automationState"],
    automationStatus: task.automationStatus,
    hierarchyRole: task.hierarchyRole,
    origin: task.origin,
    parentId: task.parentId,
    childCount: task._count?.children ?? 0,
    dueDate: task.dueDate,
    assigneeId: task.assigneeId,
    tags: task.tags,
    sprintId: task.sprintId,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    dependencyIds,
    dependencies,
    routineCadence: (task.routineRule?.cadence ?? null) as TaskView["routineCadence"],
    routineNextAt: task.routineRule?.nextAt ?? null,
  };
};
