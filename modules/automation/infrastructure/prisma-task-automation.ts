import { applyAutomationForTask } from "../../../lib/automation";
import type { TaskAutomationPort } from "../application/run-task-automation";

export const prismaTaskAutomationPort: TaskAutomationPort = {
  run: applyAutomationForTask,
};
