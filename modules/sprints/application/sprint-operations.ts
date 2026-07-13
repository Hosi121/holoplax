import type { SprintStartInput, SprintStatus, SprintUpdateInput } from "../domain/sprint-types";

export interface SprintOperationsPort {
  list(
    workspaceId: string,
    options?: { status?: SprintStatus; limit?: number },
  ): Promise<unknown[]>;
  current(workspaceId: string): Promise<unknown | null>;
  create(
    actor: { userId: string; workspaceId: string },
    input?: SprintStartInput,
  ): Promise<unknown>;
  close(actor: { userId: string; workspaceId: string }): Promise<unknown>;
  update(
    actor: { userId: string; workspaceId: string },
    sprintId: string,
    input: SprintUpdateInput,
  ): Promise<unknown>;
}

export const createSprintOperations = (port: SprintOperationsPort) => ({
  list: (workspaceId: string, options?: { status?: SprintStatus; limit?: number }) =>
    port.list(workspaceId, options),
  current: (workspaceId: string) => port.current(workspaceId),
  create: (actor: { userId: string; workspaceId: string }, input?: SprintStartInput) =>
    port.create(actor, input),
  close: (actor: { userId: string; workspaceId: string }) => port.close(actor),
  update: (
    actor: { userId: string; workspaceId: string },
    sprintId: string,
    input: SprintUpdateInput,
  ) => port.update(actor, sprintId, input),
});
