import { z } from "zod";
import { TaskPointsSchema } from "./task";

const toStringOrEmpty = (value: unknown) => (value == null ? "" : String(value));
const nonEmptyString = (message: string, max = 500) =>
  z.preprocess(toStringOrEmpty, z.string().trim().min(1, message).max(max));

export const OnboardingSchema = z
  .object({
    workspaceName: nonEmptyString("workspaceName is required", 100),
    goalTitle: nonEmptyString("goalTitle is required"),
    goalDescription: z.preprocess(toStringOrEmpty, z.string().trim().max(10_000)).optional(),
    intent: z.preprocess(toStringOrEmpty, z.string().trim().max(1_000)).optional(),
    // TaskPointsSchema enforces the Fibonacci allowlist [1,2,3,5,8,13,21,34]
    points: TaskPointsSchema.optional(),
    routineTitle: z.preprocess(toStringOrEmpty, z.string().trim().max(500)).optional(),
    routineDescription: z.preprocess(toStringOrEmpty, z.string().trim().max(10_000)).optional(),
    routineCadence: z.preprocess(toStringOrEmpty, z.string().trim().max(20)).optional(),
    // Cap the array to prevent oversized payloads; the route already slices to 3
    focusTasks: z
      .array(z.preprocess(toStringOrEmpty, z.string().trim().max(500)))
      .max(10)
      .optional(),
  })
  .strip();
