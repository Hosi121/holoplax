import type { TaskQueryPort } from "../application/task-queries";
import { getTask, listTasks } from "./prisma-task-query";

export const prismaTaskQueryPort: TaskQueryPort = {
  list: listTasks,
  get: getTask,
};
