import { z } from "zod";

const toStringOrEmpty = (value: unknown) => (value == null ? "" : String(value));
const normalizeEmail = (value: string) => value.toLowerCase();

export const EmailSchema = z
  .preprocess(
    toStringOrEmpty,
    z.string().trim().min(1, "email is required").email("email is invalid"),
  )
  .transform(normalizeEmail);

export const OptionalEmailSchema = z
  .preprocess(toStringOrEmpty, z.string().trim())
  .transform(normalizeEmail)
  .refine((value) => value === "" || z.string().email().safeParse(value).success, {
    message: "email is invalid",
  });

export const PasswordSchema = z.preprocess(
  toStringOrEmpty,
  z.string().min(8, "password must be at least 8 characters"),
);

export const AuthRegisterSchema = z
  .object({
    email: EmailSchema,
    password: PasswordSchema,
    name: z.preprocess(toStringOrEmpty, z.string().trim()).optional(),
  })
  .passthrough();

export const AuthRequestResetSchema = z
  .object({
    email: EmailSchema,
  })
  .passthrough();

export const AuthResetSchema = z
  .object({
    token: z.preprocess(toStringOrEmpty, z.string().trim().min(1, "token is required")),
    password: PasswordSchema,
  })
  .passthrough();

export const AuthVerifySchema = z
  .object({
    token: z.preprocess(toStringOrEmpty, z.string().trim().min(1, "token is required")),
  })
  .passthrough();

export const AccountUpdateSchema = z
  .object({
    name: z.preprocess(toStringOrEmpty, z.string().trim()).optional(),
    email: OptionalEmailSchema.optional(),
    image: z.preprocess(toStringOrEmpty, z.string().trim()).optional(),
  })
  .passthrough();
