import { z } from "zod";
import { getContext } from "../context.js";
import {
  type CreateSprintInput,
  closeSprint,
  createSprint,
  getCurrentSprint,
  listSprints,
} from "../services/sprints.js";

const SPRINT_STATUS_VALUES = ["ACTIVE", "CLOSED"] as const;

export const listSprintsSchema = z.object({
  status: z.enum(SPRINT_STATUS_VALUES).optional(),
});

export const createSprintSchema = z.object({
  name: z.string().optional(),
  capacityPoints: z.number().positive().optional(),
  plannedEndAt: z.string().optional(),
});

export async function handleListSprints(args: unknown) {
  const parsed = listSprintsSchema.parse(args ?? {});
  const ctx = getContext();
  return listSprints(ctx, parsed.status);
}

export async function handleGetCurrentSprint() {
  const ctx = getContext();
  return getCurrentSprint(ctx);
}

export async function handleCreateSprint(args: unknown) {
  const parsed = createSprintSchema.parse(args ?? {});
  const ctx = getContext();
  const input: CreateSprintInput = {
    name: parsed.name,
    capacityPoints: parsed.capacityPoints,
    plannedEndAt: parsed.plannedEndAt,
  };
  return createSprint(ctx, input);
}

export async function handleCloseSprint() {
  const ctx = getContext();
  return closeSprint(ctx);
}

export const sprintTools = [
  {
    name: "list_sprints",
    description:
      "List all sprints for the workspace with task point summaries. Can filter by status (ACTIVE or CLOSED).",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: SPRINT_STATUS_VALUES,
          description: "Filter by sprint status (ACTIVE or CLOSED)",
        },
      },
    },
    handler: handleListSprints,
  },
  {
    name: "get_current_sprint",
    description:
      "Get the currently active sprint with committed and completed points. Returns null if no active sprint.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    handler: handleGetCurrentSprint,
  },
  {
    name: "create_sprint",
    description:
      "Start a new sprint. Automatically closes any existing active sprint. Tasks in SPRINT status are assigned to the new sprint.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Sprint name (default: Sprint-YYYY-MM-DD)",
        },
        capacityPoints: {
          type: "number",
          description: "Sprint capacity in story points (default: 24)",
        },
        plannedEndAt: {
          type: "string",
          description: "Planned end date (ISO 8601 format)",
        },
      },
    },
    handler: handleCreateSprint,
  },
  {
    name: "close_sprint",
    description:
      "Close the current active sprint. Records completed points as velocity entry. Moves incomplete tasks back to BACKLOG.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    handler: handleCloseSprint,
  },
];
