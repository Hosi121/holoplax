import type { SprintStatus } from "@prisma/client";
import {
  closeCurrentSprint,
  createSprint as createSharedSprint,
  getCurrentSprint as getSharedCurrentSprint,
  listSprints as listSharedSprints,
  type SprintStartInput,
} from "../../../lib/sprints/sprint-service.js";
import type { ExecutionContext } from "../context.js";

export type CreateSprintInput = SprintStartInput;

export const listSprints = (ctx: ExecutionContext, status?: string) =>
  listSharedSprints(ctx.workspaceId, { status: status as SprintStatus | undefined });

export const getCurrentSprint = (ctx: ExecutionContext) => getSharedCurrentSprint(ctx.workspaceId);

export const createSprint = (ctx: ExecutionContext, input: CreateSprintInput = {}) =>
  createSharedSprint({ userId: ctx.userId, workspaceId: ctx.workspaceId, input });

export const closeSprint = (ctx: ExecutionContext) =>
  closeCurrentSprint({ userId: ctx.userId, workspaceId: ctx.workspaceId });
