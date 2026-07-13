import type { IntakeActor, IntakeCommandPort, ResolveIntakeInput } from "./intake-types";

/** Driving-port API shared by HTTP and MCP adapters. */
export const createIntakeCommands = (port: IntakeCommandPort) => ({
  list: (actor: IntakeActor) => port.list(actor),
  createMemo: (actor: IntakeActor, text: string) => port.createMemo(actor, text.trim()),
  analyze: (actor: IntakeActor, input: { intakeId: string; workspaceId: string }) =>
    port.analyze(actor, input),
  resolve: (actor: Pick<IntakeActor, "userId">, input: ResolveIntakeInput) =>
    port.resolve(actor, input),
  captureDiscord: (input: Parameters<IntakeCommandPort["captureDiscord"]>[0]) =>
    port.captureDiscord(input),
});
