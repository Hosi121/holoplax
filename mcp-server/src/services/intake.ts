import type { TaskType } from "@prisma/client";
import {
  createIntakeMemo,
  listIntakeItems,
  resolveIntakeItem,
} from "../../../lib/intake/intake-service.js";
import type { ExecutionContext } from "../context.js";

export const listIntake = (ctx: ExecutionContext) =>
  listIntakeItems({ userId: ctx.userId, workspaceId: ctx.workspaceId });

export interface CreateMemoInput {
  text: string;
}

export const createMemo = (ctx: ExecutionContext, input: CreateMemoInput) =>
  createIntakeMemo({ userId: ctx.userId, workspaceId: ctx.workspaceId, text: input.text });

export interface ResolveIntakeInput {
  intakeId: string;
  action: "dismiss" | "merge" | "create";
  taskType?: string;
  targetTaskId?: string;
}

export const resolveIntake = (ctx: ExecutionContext, input: ResolveIntakeInput) =>
  resolveIntakeItem({
    userId: ctx.userId,
    input: {
      ...input,
      workspaceId: ctx.workspaceId,
      taskType: input.taskType as TaskType | undefined,
    },
  });
