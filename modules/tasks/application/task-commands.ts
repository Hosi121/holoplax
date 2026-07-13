import type { TaskCommandPort } from "./task-command-port";
import type { CreateTaskInput, TaskActor, UpdateTaskInput } from "./task-types";

/**
 * Application-layer task command facade. Adapters depend on this API rather
 * than choosing a persistence implementation or transaction strategy.
 */
export function createTaskCommands(port: TaskCommandPort) {
  return {
    create: (actor: TaskActor, input: CreateTaskInput) => port.create(actor, input),
    update: (actor: TaskActor, taskId: string, input: UpdateTaskInput) =>
      port.update(actor, taskId, input),
    delete: (actor: TaskActor, taskId: string) => port.delete(actor, taskId),
  };
}
