import { runSerializableTransaction } from "../../shared/infrastructure/prisma-serializable-transaction";
import type { PendingTaskSplitSuggestion } from "../application/pending-task-split-command";
import { splitTaskIntoChildren } from "./prisma-task-split";

export function applyPendingTaskSplit(
  actor: { userId: string; workspaceId: string },
  command: { taskId: string; suggestions: PendingTaskSplitSuggestion[] },
) {
  return runSerializableTransaction(
    (tx) =>
      splitTaskIntoChildren(tx, {
        taskId: command.taskId,
        workspaceId: actor.workspaceId,
        userId: actor.userId,
        expectedStatuses: ["SPLIT_PENDING"],
        status: "BACKLOG",
        suggestions: command.suggestions,
      }),
    {
      code: "TASK_CONCURRENT_UPDATE",
      message: "task changed concurrently; retry the operation",
    },
  );
}
