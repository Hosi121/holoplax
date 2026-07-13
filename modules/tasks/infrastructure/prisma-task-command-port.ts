import type { TaskCommandPort } from "../application/task-command-port";
import { createTask, deleteTask, updateTask } from "./prisma-task-service";

/** Prisma-backed adapter for the task command application port. */
export const prismaTaskCommandPort: TaskCommandPort = {
  create: (actor, input) => createTask({ ...actor, input }),
  update: (actor, taskId, input) => updateTask({ ...actor, taskId, input }),
  delete: (actor, taskId) => deleteTask({ ...actor, taskId }),
};
