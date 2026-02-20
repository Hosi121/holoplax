import { z } from "zod";

const toStringOrEmpty = (value: unknown) => (value == null ? "" : String(value));
const nonEmptyString = (message: string) =>
  z.preprocess(toStringOrEmpty, z.string().trim().min(1, message));

export const OnboardingSchema = z
  .object({
    workspaceName: nonEmptyString("workspaceName is required"),
    goalTitle: nonEmptyString("goalTitle is required"),
    goalDescription: z.preprocess(toStringOrEmpty, z.string().trim()).optional(),
    intent: z.preprocess(toStringOrEmpty, z.string().trim()).optional(),
    points: z.coerce.number().optional(),
    routineTitle: z.preprocess(toStringOrEmpty, z.string().trim()).optional(),
    routineDescription: z.preprocess(toStringOrEmpty, z.string().trim()).optional(),
    routineCadence: z.preprocess(toStringOrEmpty, z.string().trim()).optional(),
    focusTasks: z.array(z.preprocess(toStringOrEmpty, z.string().trim())).optional(),
  })
  .strip();
