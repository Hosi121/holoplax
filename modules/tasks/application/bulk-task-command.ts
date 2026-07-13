import type { StoryPoint, TaskStatus } from "../domain/task-types";
import type { TaskActor } from "./task-types";

export type BulkTaskCommand = {
  action: "status" | "delete" | "points";
  taskIds: string[];
  status?: TaskStatus;
  points?: StoryPoint;
};

export type BulkTaskResult = {
  ok: true;
  action: BulkTaskCommand["action"];
  updatedCount?: number;
  deletedCount?: number;
};

export interface BulkTaskCommandPort {
  execute(actor: TaskActor, command: BulkTaskCommand): Promise<BulkTaskResult>;
}

export const createBulkTaskCommand =
  (port: BulkTaskCommandPort) => (actor: TaskActor, command: BulkTaskCommand) =>
    port.execute(actor, command);
