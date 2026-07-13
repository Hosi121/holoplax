import type { AutomationTask } from "../../automation/application/run-task-automation";
import type { StoryPoint } from "../../tasks/domain/task-types";

export type CompleteOnboardingCommand = {
  workspaceName: string;
  goalTitle?: string;
  goalDescription?: string;
  intent?: string;
  points?: StoryPoint;
  routineTitle?: string;
  routineDescription?: string;
  routineCadence?: string;
  focusTasks?: string[];
};

export type CompleteOnboardingResult =
  | { created: false; completedAt: Date }
  | {
      created: true;
      completedAt: Date;
      workspaceId: string;
      createdTasks: AutomationTask[];
    };

export interface CompleteOnboardingCommandPort {
  execute(userId: string, command: CompleteOnboardingCommand): Promise<CompleteOnboardingResult>;
}

export const createCompleteOnboardingCommand =
  (port: CompleteOnboardingCommandPort) => (userId: string, command: CompleteOnboardingCommand) =>
    port.execute(userId, command);
