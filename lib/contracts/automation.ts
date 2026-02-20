import { z } from "zod";

const toStringOrEmpty = (value: unknown) => (value == null ? "" : String(value));

export const AutomationUpdateSchema = z
  .object({
    low: z.coerce.number(),
    high: z.coerce.number(),
    stage: z.coerce.number().optional(),
  })
  .strip();

export const AutomationApprovalSchema = z
  .object({
    taskId: z.preprocess(toStringOrEmpty, z.string().trim().min(1, "taskId is required")),
    action: z
      .preprocess(toStringOrEmpty, z.string().trim())
      .transform((value) => value.toLowerCase())
      .refine((value) => value === "approve" || value === "reject", {
        message: "action must be approve or reject",
      }),
  })
  .strip();
