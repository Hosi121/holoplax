import type { CreateTaskInput, TaskActor, TaskRecord, UpdateTaskInput } from "./task-types";

/** Persistence-facing port used by task command use cases. */
export interface TaskCommandPort {
  create(actor: TaskActor, input: CreateTaskInput): Promise<TaskRecord>;
  update(actor: TaskActor, taskId: string, input: UpdateTaskInput): Promise<TaskRecord>;
  delete(actor: TaskActor, taskId: string): Promise<void>;
}
