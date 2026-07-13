import {
  createIntakeMemo,
  listIntakeItems,
  resolveIntakeItem,
} from "../../../modules/intake/index.server.js";
import type { ExecutionContext } from "../context.js";

export const listIntake = (ctx: ExecutionContext) =>
  listIntakeItems({ userId: ctx.userId, workspaceId: ctx.workspaceId });

export interface CreateMemoInput {
  text: string;
}

export const createMemo = (ctx: ExecutionContext, input: CreateMemoInput) =>
  createIntakeMemo({ userId: ctx.userId, workspaceId: ctx.workspaceId }, input.text);

export interface ResolveIntakeInput {
  intakeId: string;
  action: "dismiss" | "merge" | "create";
  taskType?: string;
  targetTaskId?: string;
}

export const resolveIntake = (ctx: ExecutionContext, input: ResolveIntakeInput) =>
  resolveIntakeItem(
    { userId: ctx.userId },
    {
      ...input,
      workspaceId: ctx.workspaceId,
      taskType: input.taskType as "EPIC" | "PBI" | "TASK" | undefined,
    },
  );
