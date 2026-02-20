import { z } from "zod";

const toStringOrEmpty = (value: unknown) => (value == null ? "" : String(value));

// Valid urgency values
const URGENCY_VALUES = ["LOW", "MEDIUM", "HIGH"] as const;

// Valid point values for Fibonacci-like estimation
const POINT_VALUES = [1, 2, 3, 5, 8, 13] as const;

export const DiscordIntakeSchema = z
  .object({
    title: z.preprocess(toStringOrEmpty, z.string().trim()),
    body: z.preprocess(toStringOrEmpty, z.string().trim()).optional(),
    source: z.preprocess(toStringOrEmpty, z.string().trim()).optional(),
    author: z.preprocess(toStringOrEmpty, z.string().trim()).optional(),
    channel: z.preprocess(toStringOrEmpty, z.string().trim()).optional(),
    // Extended fields for rich extraction
    dueDate: z.preprocess(
      (v) => (v == null || v === "" ? null : String(v)),
      z.string().nullable().optional(),
    ),
    urgency: z.enum(URGENCY_VALUES).optional(),
    points: z.preprocess(
      (v) => (v == null ? null : Number(v)),
      z
        .number()
        .refine((n) => POINT_VALUES.includes(n as (typeof POINT_VALUES)[number]))
        .nullable()
        .optional(),
    ),
    // Thread support
    threadId: z.preprocess(toStringOrEmpty, z.string().trim()).optional(),
    threadUrl: z.preprocess(toStringOrEmpty, z.string().trim()).optional(),
    messageUrl: z.preprocess(toStringOrEmpty, z.string().trim()).optional(),
  })
  .strip();

// Schema for direct task creation via slash command
export const DiscordCreateTaskSchema = z
  .object({
    title: z.preprocess(toStringOrEmpty, z.string().trim().min(1)),
    description: z.preprocess(toStringOrEmpty, z.string().trim()).optional(),
    dueDate: z.preprocess(
      (v) => (v == null || v === "" ? null : String(v)),
      z.string().nullable().optional(),
    ),
    urgency: z.enum(URGENCY_VALUES).optional().default("MEDIUM"),
    points: z.preprocess(
      (v) => (v == null ? 3 : Number(v)),
      z
        .number()
        .refine((n) => POINT_VALUES.includes(n as (typeof POINT_VALUES)[number]))
        .default(3),
    ),
    author: z.preprocess(toStringOrEmpty, z.string().trim()).optional(),
    channel: z.preprocess(toStringOrEmpty, z.string().trim()).optional(),
    threadId: z.preprocess(toStringOrEmpty, z.string().trim()).optional(),
    messageId: z.preprocess(toStringOrEmpty, z.string().trim()).optional(),
  })
  .strip();
