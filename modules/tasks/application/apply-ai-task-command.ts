export type ApplyAiTaskCommand = {
  taskId: string;
  type: string;
  suggestionId?: string;
  payload?: Record<string, unknown> | null;
};

export type ApplyAiTaskResult = { ok: true; applied?: false };
