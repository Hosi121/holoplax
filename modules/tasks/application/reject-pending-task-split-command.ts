export interface RejectPendingTaskSplitCommandPort {
  execute(actor: { userId: string; workspaceId: string }, taskId: string): Promise<boolean>;
}

export const createRejectPendingTaskSplitCommand = (port: RejectPendingTaskSplitCommandPort) =>
  port.execute.bind(port);
