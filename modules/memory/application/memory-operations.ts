export type MemoryActor = { userId: string; workspaceId: string | null };

export interface MemoryOperationsPort {
  list(actor: MemoryActor): Promise<Record<string, unknown>>;
  createClaim(actor: MemoryActor, definitionId: string, value: unknown): Promise<unknown>;
  deleteClaim(actor: MemoryActor, claimId: string): Promise<unknown>;
  listQuestions(actor: MemoryActor): Promise<unknown[]>;
  createQuestion(
    actor: MemoryActor,
    input: {
      definitionId: string;
      confidence?: number;
      valueStr?: string | null;
      valueNum?: number | null;
      valueBool?: boolean | null;
      valueJson?: unknown;
    },
  ): Promise<unknown>;
  actOnQuestion(
    actor: MemoryActor,
    questionId: string,
    action: "accept" | "reject" | "hold",
  ): Promise<unknown>;
}

export const createMemoryOperations = (port: MemoryOperationsPort) => ({
  list: (actor: MemoryActor) => port.list(actor),
  createClaim: (actor: MemoryActor, definitionId: string, value: unknown) =>
    port.createClaim(actor, definitionId, value),
  deleteClaim: (actor: MemoryActor, claimId: string) => port.deleteClaim(actor, claimId),
  listQuestions: (actor: MemoryActor) => port.listQuestions(actor),
  createQuestion: (
    actor: MemoryActor,
    input: Parameters<MemoryOperationsPort["createQuestion"]>[1],
  ) => port.createQuestion(actor, input),
  actOnQuestion: (actor: MemoryActor, questionId: string, action: "accept" | "reject" | "hold") =>
    port.actOnQuestion(actor, questionId, action),
});
