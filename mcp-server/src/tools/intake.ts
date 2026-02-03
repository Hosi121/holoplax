import { z } from "zod";
import { getContext } from "../context.js";
import {
  type CreateMemoInput,
  createMemo,
  listIntake,
  type ResolveIntakeInput,
  resolveIntake,
} from "../services/intake.js";

const TASK_TYPE_VALUES = ["EPIC", "PBI", "TASK", "ROUTINE"] as const;
const ACTION_VALUES = ["dismiss", "merge", "create"] as const;

export const createMemoSchema = z.object({
  text: z.string().min(1, "text is required"),
});

export const resolveIntakeSchema = z.object({
  intakeId: z.string().min(1, "intakeId is required"),
  action: z.enum(ACTION_VALUES),
  taskType: z.enum(TASK_TYPE_VALUES).optional(),
  targetTaskId: z.string().optional(),
});

export async function handleListIntake() {
  const ctx = getContext();
  return listIntake(ctx);
}

export async function handleCreateMemo(args: unknown) {
  const parsed = createMemoSchema.parse(args);
  const ctx = getContext();
  const input: CreateMemoInput = {
    text: parsed.text,
  };
  return createMemo(ctx, input);
}

export async function handleResolveIntake(args: unknown) {
  const parsed = resolveIntakeSchema.parse(args);
  const ctx = getContext();
  const input: ResolveIntakeInput = {
    intakeId: parsed.intakeId,
    action: parsed.action,
    taskType: parsed.taskType,
    targetTaskId: parsed.targetTaskId,
  };
  return resolveIntake(ctx, input);
}

export const intakeTools = [
  {
    name: "list_intake",
    description:
      "List pending intake items. Returns both global items (not assigned to workspace) and workspace-specific items.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    handler: handleListIntake,
  },
  {
    name: "create_memo",
    description:
      "Create a new intake memo. Automatically derives a title from the first line. Also returns potential duplicate tasks based on title similarity.",
    inputSchema: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "Memo content",
        },
      },
      required: ["text"],
    },
    handler: handleCreateMemo,
  },
  {
    name: "resolve_intake",
    description:
      "Resolve an intake item. Actions: 'dismiss' (mark as dismissed), 'merge' (append to existing task), 'create' (create new task from intake).",
    inputSchema: {
      type: "object",
      properties: {
        intakeId: {
          type: "string",
          description: "Intake item ID to resolve",
        },
        action: {
          type: "string",
          enum: ACTION_VALUES,
          description: "Action to take: dismiss, merge, or create",
        },
        taskType: {
          type: "string",
          enum: TASK_TYPE_VALUES,
          description: "Task type when creating (default: PBI)",
        },
        targetTaskId: {
          type: "string",
          description: "Target task ID when merging",
        },
      },
      required: ["intakeId", "action"],
    },
    handler: handleResolveIntake,
  },
];
