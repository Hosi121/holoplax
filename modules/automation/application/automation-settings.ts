export type AutomationSettings = {
  low: number;
  high: number;
  stage: number;
  effectiveLow: number;
  effectiveHigh: number;
  workspaceId: string | null;
};

export type AutomationSettingsActor = {
  userId: string;
  workspaceId: string;
};

export interface AutomationSettingsPort {
  get(actor: AutomationSettingsActor): Promise<AutomationSettings>;
  update(
    actor: AutomationSettingsActor,
    thresholds: { low: number; high: number },
  ): Promise<AutomationSettings>;
  resetStage(actor: AutomationSettingsActor): Promise<AutomationSettings>;
}

export const createAutomationSettingsCommands = (port: AutomationSettingsPort) => ({
  get: (actor: AutomationSettingsActor) => port.get(actor),
  update: (actor: AutomationSettingsActor, thresholds: { low: number; high: number }) =>
    port.update(actor, thresholds),
  resetStage: (actor: AutomationSettingsActor) => port.resetStage(actor),
});
