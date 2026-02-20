import { z } from "zod";
import { EmailSchema, PasswordSchema } from "./auth";

const toStringOrEmpty = (value: unknown) => (value == null ? "" : String(value));
const optionalBoolean = z
  .preprocess((value) => {
    if (value === null || value === undefined || value === "") return undefined;
    return value;
  }, z.coerce.boolean())
  .optional();

export const AdminAiUpdateSchema = z
  .object({
    model: z.preprocess(toStringOrEmpty, z.string().trim()).optional(),
    baseUrl: z.preprocess(toStringOrEmpty, z.string().trim()).optional(),
    enabled: optionalBoolean,
    apiKey: z.preprocess(toStringOrEmpty, z.string().trim()).optional(),
  })
  .strip();

export const AdminUserCreateSchema = z
  .object({
    email: EmailSchema,
    password: PasswordSchema,
    name: z.preprocess(toStringOrEmpty, z.string().trim()).optional(),
    role: z.preprocess(toStringOrEmpty, z.string().trim()).optional(),
  })
  .strip();

export const AdminUserUpdateSchema = z
  .object({
    role: z.preprocess(toStringOrEmpty, z.string().trim()).optional(),
    disabled: optionalBoolean,
  })
  .strip();
