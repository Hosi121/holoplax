import { aiTools } from "./ai.js";
import { intakeTools } from "./intake.js";
import { sprintTools } from "./sprints.js";
import { taskTools } from "./tasks.js";

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, unknown>;
    required?: string[];
  };
  handler: (args: unknown) => Promise<unknown>;
}

export const allTools: ToolDefinition[] = [
  ...taskTools,
  ...sprintTools,
  ...intakeTools,
  ...aiTools,
];

export function getToolByName(name: string): ToolDefinition | undefined {
  return allTools.find((tool) => tool.name === name);
}

export function listToolDefinitions() {
  return allTools.map(({ name, description, inputSchema }) => ({
    name,
    description,
    inputSchema,
  }));
}
