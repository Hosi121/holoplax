import { z } from "zod";
import { getContext } from "../context.js";
import {
  type AiScoreInput,
  type AiSplitInput,
  type AiSuggestInput,
  aiScore,
  aiSplit,
  aiSuggest,
  type SplitItem,
} from "../services/ai.js";

export const aiScoreSchema = z.object({
  title: z.string().min(1, "title is required"),
  description: z.string().optional(),
  taskId: z.string().optional(),
});

export const aiSplitSchema = z.object({
  title: z.string().min(1, "title is required"),
  description: z.string().optional(),
  points: z.number().positive("points must be positive"),
  taskId: z.string().optional(),
});

export const aiSuggestSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  taskId: z.string().optional(),
});

export async function handleAiScore(args: unknown) {
  const parsed = aiScoreSchema.parse(args);
  const ctx = getContext();
  const input: AiScoreInput = {
    title: parsed.title,
    description: parsed.description,
    taskId: parsed.taskId,
  };
  return aiScore(ctx, input);
}

export async function handleAiSplit(
  args: unknown,
): Promise<{ suggestions: SplitItem[]; suggestionId: string }> {
  const parsed = aiSplitSchema.parse(args);
  const ctx = getContext();
  const input: AiSplitInput = {
    title: parsed.title,
    description: parsed.description,
    points: parsed.points,
    taskId: parsed.taskId,
  };
  return aiSplit(ctx, input);
}

export async function handleAiSuggest(args: unknown) {
  const parsed = aiSuggestSchema.parse(args ?? {});
  const ctx = getContext();
  const input: AiSuggestInput = {
    title: parsed.title,
    description: parsed.description,
    taskId: parsed.taskId,
  };
  return aiSuggest(ctx, input);
}

export const aiTools = [
  {
    name: "ai_score",
    description:
      "Estimate task complexity and suggest story points, urgency, and risk levels based on title and description. Returns a score (0-100) indicating task priority.",
    inputSchema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Task title",
        },
        description: {
          type: "string",
          description: "Task description",
        },
        taskId: {
          type: "string",
          description: "Optional task ID to associate with the suggestion",
        },
      },
      required: ["title"],
    },
    handler: handleAiScore,
  },
  {
    name: "ai_split",
    description:
      "Generate task split suggestions. Takes a large task and returns 2-4 smaller subtasks with estimated points, urgency, and risk.",
    inputSchema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Task title",
        },
        description: {
          type: "string",
          description: "Task description",
        },
        points: {
          type: "number",
          description: "Current story points of the task",
        },
        taskId: {
          type: "string",
          description: "Optional task ID to associate with the suggestion",
        },
      },
      required: ["title", "points"],
    },
    handler: handleAiSplit,
  },
  {
    name: "ai_suggest",
    description:
      "Get AI suggestions for improving a task. Returns actionable tips for task decomposition and prioritization.",
    inputSchema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Task title",
        },
        description: {
          type: "string",
          description: "Task description",
        },
        taskId: {
          type: "string",
          description: "Optional task ID to associate with the suggestion",
        },
      },
    },
    handler: handleAiSuggest,
  },
];
