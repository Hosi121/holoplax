import type { Prisma, TaskAutomationState, TaskStatus } from "@prisma/client";
import { sanitizeSplitSuggestion } from "../../../lib/ai-normalization";
import { AUTOMATION_STATE, TASK_STATUS, TASK_TYPE } from "../../../lib/types";
import { ApplicationError } from "../../shared/application/application-error";
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
    expectedStates: TaskAutomationState[];
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

  const suggestions = params.suggestions.map(sanitizeSplitSuggestion);
  if (suggestions.some((item) => item.title.length === 0)) {
    throw badRequest("split child title is required");
  }

  const claimed = await tx.task.updateMany({
    where: {
      id: params.taskId,
      workspaceId: params.workspaceId,
      automationState: { in: params.expectedStates },
    },
    data: { automationState: AUTOMATION_STATE.SPLIT_PARENT },
  });
  if (claimed.count !== 1) {
    return { applied: false, created: 0, sprintId: null };
  }

  let sprintId: string | null = null;
  if (params.status === TASK_STATUS.SPRINT) {
    const capacity = await checkSprintCapacity(tx, {
      workspaceId: params.workspaceId,
      additionalPoints: suggestions.reduce((sum, item) => sum + item.points, 0),
    });
    if (!capacity.activeSprint) throw badRequest("active sprint not found");
    if (capacity.exceeded) throw badRequest("sprint capacity exceeded");
    sprintId = capacity.activeSprint.id;
  }

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
        type: TASK_TYPE.TASK,
        parentId: params.taskId,
        workspaceId: params.workspaceId,
        userId: params.userId,
      },
      { actorId: params.userId, trigger: "API" },
    );
  }

  return { applied: true, created: suggestions.length, sprintId };
}
