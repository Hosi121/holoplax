import { z } from "zod";

const toStringOrEmpty = (value: unknown) => (value == null ? "" : String(value));

export const AutomationUpdateSchema = z
  .object({
    // Points thresholds for automation triggers. Capped at 200 to prevent
    // nonsensical values; negative thresholds make no sense for story points.
    low: z.coerce.number().min(0).max(200),
    high: z.coerce.number().min(0).max(200),
    // NOTE: `stage` is intentionally absent.  It is a server-managed field
    // advanced by the approval flow (maybeRaiseStage) with a 7-day cooldown.
    // Accepting it here would let users bypass the progression system.
  })
  .strip()
  .refine((data) => data.low < data.high, {
    message: "low must be less than high",
    path: ["low"],
  });

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
