import { createAutomationSettingsCommands } from "./application/automation-settings";
import { createReviewTaskSplitCommand } from "./application/review-task-split-command";
import { prismaReviewTaskSplitCommandPort } from "./infrastructure/prisma-review-task-split-command";

export const reviewTaskSplit = createReviewTaskSplitCommand(prismaReviewTaskSplitCommandPort);

const settings = createAutomationSettingsCommands(prismaAutomationSettingsPort);
export const getAutomationSettings = settings.get;
export const updateAutomationSettings = settings.update;
export const resetAutomationStage = settings.resetStage;

import { prismaAutomationSettingsPort } from "./infrastructure/prisma-automation-settings";
