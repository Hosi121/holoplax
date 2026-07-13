export type ReviewTaskSplitCommand = {
  taskId: string;
  action: "approve" | "reject";
};

export type ReviewTaskSplitResult = {
  status: "approved" | "rejected" | "no-pending";
  created?: number;
};

export interface ReviewTaskSplitCommandPort {
  execute(
    actor: { userId: string; workspaceId: string },
    command: ReviewTaskSplitCommand,
  ): Promise<ReviewTaskSplitResult>;
}

export const createReviewTaskSplitCommand =
  (port: ReviewTaskSplitCommandPort) =>
  (actor: { userId: string; workspaceId: string }, command: ReviewTaskSplitCommand) =>
    port.execute(actor, command);
