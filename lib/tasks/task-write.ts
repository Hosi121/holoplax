import { Prisma, type Task } from "@prisma/client";
import { randomUUID } from "crypto";
import { TASK_STATUS } from "../types";

type Tx = Prisma.TransactionClient;

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
export const normalizeChecklistForReset = (value: unknown) => {
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
  const newRoutineTask = await tx.task.create({
    data: {
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
  });
  await tx.routineRule.update({
    where: { taskId: task.id },
    data: { taskId: newRoutineTask.id, nextAt },
  });
  await tx.taskStatusEvent.create({
    data: {
      taskId: newRoutineTask.id,
      fromStatus: null,
      toStatus: TASK_STATUS.BACKLOG,
      actorId: userId,
      trigger: "ROUTINE",
      workspaceId,
    },
  });
  return newRoutineTask;
}
