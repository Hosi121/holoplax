export type AutomationTask = {
  id: string;
  title: string;
  description: string;
  points: number;
  status: string;
};

export type RunTaskAutomationCommand = {
  userId: string;
  workspaceId: string;
  task: AutomationTask;
};

export interface TaskAutomationPort {
  run(command: RunTaskAutomationCommand): Promise<void>;
}

export const createRunTaskAutomation =
  (port: TaskAutomationPort) => (command: RunTaskAutomationCommand) =>
    port.run(command);
