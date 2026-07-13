export type PendingTaskSplitSuggestion = {
  title: string;
  detail?: string | null;
  points: unknown;
  urgency?: unknown;
  risk?: unknown;
};

export interface PendingTaskSplitCommandPort {
  execute(
    actor: { userId: string; workspaceId: string },
    command: { taskId: string; suggestions: PendingTaskSplitSuggestion[] },
  ): Promise<{ applied: boolean; created: number; sprintId: string | null }>;
}

export const createPendingTaskSplitCommand = (port: PendingTaskSplitCommandPort) =>
  port.execute.bind(port);
