import { createAutomationSettingsCommands } from "./application/automation-settings";
import { createReviewTaskSplitCommand } from "./application/review-task-split-command";
import { d1ReviewTaskSplitCommandPort } from "./infrastructure/d1-review-task-split-command";

export const reviewTaskSplit = createReviewTaskSplitCommand(d1ReviewTaskSplitCommandPort);

const settings = createAutomationSettingsCommands(d1AutomationSettingsPort);
export const getAutomationSettings = settings.get;
export const updateAutomationSettings = settings.update;
export const resetAutomationStage = settings.resetStage;

import { d1AutomationSettingsPort } from "./infrastructure/d1-automation-settings";
