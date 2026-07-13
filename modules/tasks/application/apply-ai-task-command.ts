import type { TaskActor } from "./task-types";

export type ApplyAiTaskCommand = {
  taskId: string;
  type: string;
  suggestionId?: string;
  payload?: Record<string, unknown> | null;
};

export type ApplyAiTaskResult = { ok: true; applied?: false };

export interface ApplyAiTaskCommandPort {
  execute(actor: TaskActor, command: ApplyAiTaskCommand): Promise<ApplyAiTaskResult>;
}

export const createApplyAiTaskCommand =
  (port: ApplyAiTaskCommandPort) => (actor: TaskActor, command: ApplyAiTaskCommand) =>
    port.execute(actor, command);
