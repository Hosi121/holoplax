import { runSerializableTransaction } from "../../shared/infrastructure/prisma-serializable-transaction";
import type { PendingTaskSplitCommandPort } from "../application/pending-task-split-command";
import { splitTaskIntoChildren } from "./prisma-task-split";

export const prismaPendingTaskSplitCommandPort: PendingTaskSplitCommandPort = {
  execute(actor, command) {
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
  },
};
