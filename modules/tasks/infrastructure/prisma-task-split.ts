import type { Prisma, TaskAutomationStatus, TaskStatus } from "@prisma/client";
import { sanitizeSplitSuggestion } from "../../../lib/ai-normalization";
import {
  AUTOMATION_STATE,
  AUTOMATION_STATUS,
  TASK_HIERARCHY_ROLE,
  TASK_ORIGIN,
  TASK_STATUS,
  TASK_TYPE,
} from "../../../lib/types";
import { ApplicationError } from "../../shared/application/application-error";
import { removeTaskFromActiveSprint } from "../../shared/infrastructure/prisma-sprint-items";
import { recordTaskStatusTransition } from "../../shared/infrastructure/prisma-task-status-events";
import { deriveLegacyStatus } from "../domain/task-workflow";
import { checkSprintCapacity } from "./prisma-sprint-capacity";
import { persistNewTask } from "./prisma-task-writer";

type Tx = Prisma.TransactionClient;

export type SplitChildInput = {
  title: string;
  detail?: string | null;
  points: unknown;
  urgency?: unknown;
  risk?: unknown;
};

export type SplitTaskResult = {
  applied: boolean;
  created: number;
  sprintId: string | null;
};

const badRequest = (message: string) =>
  new ApplicationError("TASK_SPLIT_BAD_REQUEST", message, "bad_request");

const ALLOWED_SPLIT_STATUSES = new Set<TaskStatus>([TASK_STATUS.BACKLOG, TASK_STATUS.SPRINT]);

/**
 * Atomically claim a task as a split parent and create normalized child tasks.
 * Capacity, sprint linkage, automation state, and initial status events live
 * here so every split entry point has identical invariants.
 */
export async function splitTaskIntoChildren(
  tx: Tx,
  params: {
    taskId: string;
    workspaceId: string;
    userId: string;
    expectedStatuses: TaskAutomationStatus[];
    status: TaskStatus;
    suggestions: SplitChildInput[];
  },
): Promise<SplitTaskResult> {
  if (!ALLOWED_SPLIT_STATUSES.has(params.status)) {
    throw badRequest("split children must start in backlog or sprint");
  }
  if (params.suggestions.length === 0) {
    throw badRequest("at least one split suggestion is required");
  }

  const parent = await tx.task.findFirst({
    where: { id: params.taskId, workspaceId: params.workspaceId },
    select: {
      title: true,
      workflowState: true,
      sprintId: true,
      sprint: { select: { status: true } },
      type: true,
    },
  });
  if (!parent) throw badRequest("task not found");
  const parentStatus = deriveLegacyStatus({
    workflowState: parent.workflowState,
    isInActiveSprint: parent.sprint?.status === "ACTIVE",
  });

  const suggestions = params.suggestions.map(sanitizeSplitSuggestion);
  if (suggestions.some((item) => item.title.length === 0)) {
    throw badRequest("split child title is required");
  }

  const claimed = await tx.task.updateMany({
    where: {
      id: params.taskId,
      workspaceId: params.workspaceId,
      automationStatus: { in: params.expectedStatuses },
      hierarchyRole: { not: TASK_HIERARCHY_ROLE.SPLIT_PARENT },
    },
    // A split parent becomes an informational container. Keeping it committed
    // alongside its children would count both estimates and corrupt capacity
    // and velocity, so only the children retain planning membership.
    data: {
      automationState: AUTOMATION_STATE.SPLIT_PARENT,
      automationStatus: AUTOMATION_STATUS.NONE,
      hierarchyRole: TASK_HIERARCHY_ROLE.SPLIT_PARENT,
      sprintId: null,
    },
  });
  if (claimed.count !== 1) {
    return { applied: false, created: 0, sprintId: null };
  }

  let sprintId: string | null = null;
  if (params.status === TASK_STATUS.SPRINT) {
    const capacity = await checkSprintCapacity(tx, {
      workspaceId: params.workspaceId,
      additionalPoints: suggestions.reduce((sum, item) => sum + item.points, 0),
      excludeTaskIds: parentStatus === TASK_STATUS.SPRINT ? [params.taskId] : [],
    });
    if (!capacity.activeSprint) throw badRequest("active sprint not found");
    if (capacity.exceeded) throw badRequest("sprint capacity exceeded");
    sprintId = capacity.activeSprint.id;
  }

  if (parentStatus !== TASK_STATUS.BACKLOG) {
    await recordTaskStatusTransition(tx, {
      taskId: params.taskId,
      taskTitle: parent.title,
      fromStatus: parentStatus,
      toStatus: TASK_STATUS.BACKLOG,
      actorId: params.userId,
      trigger: "API",
      workspaceId: params.workspaceId,
    });
  }
  await removeTaskFromActiveSprint(tx, { taskId: params.taskId });

  for (const item of suggestions) {
    await persistNewTask(
      tx,
      {
        title: item.title,
        description: item.detail,
        points: item.points,
        urgency: item.urgency,
        risk: item.risk,
        status: params.status,
        sprintId,
        automationState: AUTOMATION_STATE.SPLIT_CHILD,
        automationStatus: AUTOMATION_STATUS.NONE,
        hierarchyRole: TASK_HIERARCHY_ROLE.SPLIT_CHILD,
        origin: TASK_ORIGIN.AUTOMATION,
        type: parent.type === TASK_TYPE.EPIC ? TASK_TYPE.PBI : TASK_TYPE.TASK,
        parentId: params.taskId,
        workspaceId: params.workspaceId,
        userId: params.userId,
      },
      { actorId: params.userId, trigger: "API" },
    );
  }

  return { applied: true, created: suggestions.length, sprintId };
}
