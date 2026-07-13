import { createCompleteOnboardingCommand } from "./application/complete-onboarding-command";
import { prismaCompleteOnboardingCommandPort } from "./infrastructure/prisma-complete-onboarding-command";

export const completeOnboarding = createCompleteOnboardingCommand(
  prismaCompleteOnboardingCommandPort,
);
