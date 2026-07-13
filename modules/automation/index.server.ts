import { createAutomationSettingsCommands } from "./application/automation-settings";
import { createReviewTaskSplitCommand } from "./application/review-task-split-command";
import { createRunTaskAutomation } from "./application/run-task-automation";
import { prismaReviewTaskSplitCommandPort } from "./infrastructure/prisma-review-task-split-command";
import { prismaTaskAutomationPort } from "./infrastructure/prisma-task-automation";

export const reviewTaskSplit = createReviewTaskSplitCommand(prismaReviewTaskSplitCommandPort);
export const runTaskAutomation = createRunTaskAutomation(prismaTaskAutomationPort);

const settings = createAutomationSettingsCommands(prismaAutomationSettingsPort);
export const getAutomationSettings = settings.get;
export const updateAutomationSettings = settings.update;
export const resetAutomationStage = settings.resetStage;

import { prismaAutomationSettingsPort } from "./infrastructure/prisma-automation-settings";
