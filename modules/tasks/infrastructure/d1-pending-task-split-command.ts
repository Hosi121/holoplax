import { runAtomicCommand } from "../../shared/infrastructure/d1-atomic-command";
import type { PendingTaskSplitSuggestion } from "../application/pending-task-split-command";
import { splitTaskIntoChildren } from "./d1-task-split";

export function applyPendingTaskSplit(
  actor: { userId: string; workspaceId: string },
  command: { taskId: string; suggestions: PendingTaskSplitSuggestion[] },
) {
  return runAtomicCommand(
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
