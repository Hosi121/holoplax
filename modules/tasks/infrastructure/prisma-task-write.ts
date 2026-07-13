import { Prisma, type Task } from "@prisma/client";
import { randomUUID } from "crypto";
import { TASK_STATUS } from "../../../lib/types";
import { persistNewTask } from "./prisma-task-writer";

type Tx = Prisma.TransactionClient;

export const hasIncompleteChecklist = (value: unknown): boolean =>
  Array.isArray(value) &&
  value.some((item) => item && typeof item === "object" && !(item as Record<string, unknown>).done);

export const graphHasCycleFrom = (
  startId: string,
  edges: ReadonlyMap<string, readonly string[]>,
): boolean => {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const next of edges.get(id) ?? []) {
      if (visit(next)) return true;
    }
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  return visit(startId);
};

export async function taskDependencyWouldCycle(
  tx: Tx,
  params: { taskId: string; workspaceId: string; dependencyIds: string[] },
): Promise<boolean> {
  const rows = await tx.taskDependency.findMany({
    where: { task: { workspaceId: params.workspaceId } },
    select: { taskId: true, dependsOnId: true },
  });
  const graph = new Map<string, string[]>();
  for (const row of rows) {
    if (row.taskId === params.taskId) continue;
    graph.set(row.taskId, [...(graph.get(row.taskId) ?? []), row.dependsOnId]);
  }
  graph.set(params.taskId, [...new Set(params.dependencyIds)]);
  return graphHasCycleFrom(params.taskId, graph);
}

export async function taskParentWouldCycle(
  tx: Tx,
  params: { taskId: string; workspaceId: string; parentId: string | null },
): Promise<boolean> {
  if (!params.parentId) return false;
  if (params.parentId === params.taskId) return true;
  const rows = await tx.task.findMany({
    where: { workspaceId: params.workspaceId },
    select: { id: true, parentId: true },
  });
  const parents = new Map(rows.map((row) => [row.id, row.parentId]));
  parents.set(params.taskId, params.parentId);
  const seen = new Set<string>();
  let cursor: string | null | undefined = params.taskId;
  while (cursor) {
    if (seen.has(cursor)) return true;
    seen.add(cursor);
    cursor = parents.get(cursor);
  }
  return false;
}

export type RoutineCadence = "DAILY" | "WEEKLY";

/** The next due date for a routine, one cadence period after `base`. */
export const nextRoutineAt = (cadence: RoutineCadence, base: Date) => {
  const next = new Date(base);
  next.setDate(next.getDate() + (cadence === "DAILY" ? 1 : 7));
  return next;
};

/** Map a value to Prisma's JSON input, distinguishing SQL null from "leave unset". */
export const toNullableJsonInput = (
  value: unknown,
): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.DbNull;
  return value as Prisma.InputJsonValue;
};

/** Reset every checklist item to not-done with a fresh id, dropping blanks. */
const normalizeChecklistForReset = (value: unknown) => {
  if (!Array.isArray(value)) return null;
  return value
    .map((item) => {
      if (item && typeof item === "object") {
        const obj = item as Record<string, unknown>;
        const text = typeof obj.text === "string" ? obj.text : String(obj.text ?? "");
        return {
          id: typeof obj.id === "string" ? obj.id : randomUUID(),
          text: text.trim(),
          done: false,
        };
      }
      return { id: randomUUID(), text: String(item ?? "").trim(), done: false };
    })
    .filter((item) => item.text.length > 0);
};

/**
 * Replace a task's dependency edges with the given ids, keeping only those that
 * belong to the same workspace and are not the task itself.
 */
export async function syncTaskDependencies(
  tx: Tx,
  params: { taskId: string; workspaceId: string; dependencyIds: string[] },
) {
  const { taskId, workspaceId, dependencyIds } = params;
  const allowed = dependencyIds.length
    ? await tx.task.findMany({
        where: { id: { in: dependencyIds }, workspaceId },
        select: { id: true },
      })
    : [];
  await tx.taskDependency.deleteMany({ where: { taskId } });
  if (allowed.length > 0) {
    await tx.taskDependency.createMany({
      data: allowed
        .map((dep) => dep.id)
        .filter((depId) => depId && depId !== taskId)
        .map((depId) => ({ taskId, dependsOnId: depId })),
      skipDuplicates: true,
    });
  }
}

type TaskWithRoutineRule = Task & {
  routineRule: { nextAt: Date | null; cadence: string } | null;
};

/**
 * Reconcile a task's RoutineRule after an update. Recurrence is expressed solely
 * by the rule's presence (there is no ROUTINE task type): upsert it when a
 * cadence is given, bump only its nextAt, or clear it when the caller asked to.
 */
export async function syncRoutineRule(
  tx: Tx,
  params: {
    task: TaskWithRoutineRule;
    cadenceValue: RoutineCadence | null;
    routineNextAt: Date | null;
    shouldClearRoutine: boolean;
  },
) {
  const { task, cadenceValue, routineNextAt, shouldClearRoutine } = params;
  if (cadenceValue) {
    const baseDate = task.dueDate ? new Date(task.dueDate) : new Date();
    const nextAt =
      routineNextAt ?? task.routineRule?.nextAt ?? nextRoutineAt(cadenceValue, baseDate);
    await tx.routineRule.upsert({
      where: { taskId: task.id },
      update: { cadence: cadenceValue, nextAt },
      create: { taskId: task.id, cadence: cadenceValue, nextAt },
    });
  } else if (routineNextAt && task.routineRule) {
    await tx.routineRule.update({ where: { taskId: task.id }, data: { nextAt: routineNextAt } });
  } else if (shouldClearRoutine && task.routineRule) {
    await tx.routineRule.delete({ where: { taskId: task.id } });
  }
}

/**
 * When a routine task is completed, clone it back into the backlog as the next
 * occurrence (checklist reset), move the RoutineRule to the clone, and bump the
 * rule's nextAt. Returns the created task, or null when there is no rule.
 */
export async function createNextRoutineOccurrence(
  tx: Tx,
  params: { task: TaskWithRoutineRule; userId: string; workspaceId: string },
): Promise<Task | null> {
  const { task, userId, workspaceId } = params;
  const rule =
    task.routineRule ?? (await tx.routineRule.findUnique({ where: { taskId: task.id } }));
  if (!rule) return null;

  const now = new Date();
  const dueAt = rule.nextAt && rule.nextAt > now ? rule.nextAt : now;
  const nextAt = nextRoutineAt(rule.cadence as RoutineCadence, dueAt);
  const newRoutineTask = await persistNewTask(
    tx,
    {
      title: task.title,
      description: task.description ?? "",
      definitionOfDone: task.definitionOfDone ?? "",
      checklist: toNullableJsonInput(normalizeChecklistForReset(task.checklist)),
      points: task.points,
      urgency: task.urgency,
      risk: task.risk,
      status: TASK_STATUS.BACKLOG,
      type: task.type,
      dueDate: dueAt,
      tags: task.tags ?? [],
      assigneeId: task.assigneeId ?? null,
      userId: task.userId ?? userId,
      workspaceId,
    },
    { actorId: userId, trigger: "ROUTINE" },
  );
  await tx.routineRule.update({
    where: { taskId: task.id },
    data: { taskId: newRoutineTask.id, nextAt },
  });
  return newRoutineTask;
}
