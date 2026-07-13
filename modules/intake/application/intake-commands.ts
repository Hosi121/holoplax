import type { IntakeActor, IntakeCommandPort, ResolveIntakeInput } from "./intake-types";

export type IntakeTaskConverter = (
  actor: Pick<IntakeActor, "userId">,
  input: { intakeId: string; workspaceId: string; taskType?: "EPIC" | "PBI" | "TASK" | null },
) => Promise<{ taskId: string }>;

/** Driving-port API shared by HTTP and MCP adapters. */
export const createIntakeCommands = (
  port: IntakeCommandPort,
  convertTask: IntakeTaskConverter,
) => ({
  list: (actor: IntakeActor) => port.list(actor),
  createMemo: (actor: IntakeActor, text: string) => port.createMemo(actor, text.trim()),
  analyze: (actor: IntakeActor, input: { intakeId: string; workspaceId: string }) =>
    port.analyze(actor, input),
  resolve: (actor: Pick<IntakeActor, "userId">, input: ResolveIntakeInput) => {
    if (input.action === "create") {
      if (!input.workspaceId) return port.resolve(actor, input);
      return convertTask(actor, {
        intakeId: input.intakeId,
        workspaceId: input.workspaceId,
        taskType: input.taskType,
      });
    }
    return port.resolve(actor, input);
  },
  captureDiscord: (input: Parameters<IntakeCommandPort["captureDiscord"]>[0]) =>
    port.captureDiscord(input),
});
