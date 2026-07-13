import prisma from "../../../lib/prisma";
import type { PendingTaskSplitCommandPort } from "../application/pending-task-split-command";
import { splitTaskIntoChildren } from "./prisma-task-split";

export const prismaPendingTaskSplitCommandPort: PendingTaskSplitCommandPort = {
  execute(actor, command) {
    return prisma.$transaction(
      (tx) =>
        splitTaskIntoChildren(tx, {
          taskId: command.taskId,
          workspaceId: actor.workspaceId,
          userId: actor.userId,
          expectedStatuses: ["SPLIT_PENDING"],
          status: "BACKLOG",
          suggestions: command.suggestions,
        }),
      { isolationLevel: "Serializable" },
    );
  },
};
