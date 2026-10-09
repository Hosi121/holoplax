import { createTask } from "../tasks/index.server";
import { createCompleteOnboardingCommand } from "./application/complete-onboarding-command";
import { d1CompleteOnboardingCommandPort } from "./infrastructure/d1-complete-onboarding-command";

export const completeOnboarding = createCompleteOnboardingCommand(
  d1CompleteOnboardingCommandPort,
  createTask,
);
