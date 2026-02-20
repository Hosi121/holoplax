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

// bcrypt silently truncates passwords at 72 bytes. Cap at 1 000 characters to
// (a) prevent a long-password CPU-exhaustion attack and (b) give users a clear
// error before bcrypt silently loses entropy on very long inputs.
export const PasswordSchema = z.preprocess(
  toStringOrEmpty,
  z.string().min(8, "password must be at least 8 characters").max(1000, "password is too long"),
);

export const AuthRegisterSchema = z
  .object({
    email: EmailSchema,
    password: PasswordSchema,
    name: z.preprocess(toStringOrEmpty, z.string().trim()).optional(),
  })
  .strip();

export const AuthRequestResetSchema = z
  .object({
    email: EmailSchema,
  })
  .strip();

export const AuthResetSchema = z
  .object({
    token: z.preprocess(toStringOrEmpty, z.string().trim().min(1, "token is required")),
    password: PasswordSchema,
  })
  .strip();

export const AuthVerifySchema = z
  .object({
    token: z.preprocess(toStringOrEmpty, z.string().trim().min(1, "token is required")),
  })
  .strip();

export const AccountUpdateSchema = z
  .object({
    name: z.preprocess(toStringOrEmpty, z.string().trim().max(200)).optional(),
    email: OptionalEmailSchema.optional(),
    // image should be a URL, not a data URL — limit to URL max length.
    image: z.preprocess(toStringOrEmpty, z.string().trim().max(2048)).optional(),
  })
  .strip();

export const AccountPasswordChangeSchema = z
  .object({
    currentPassword: PasswordSchema,
    newPassword: PasswordSchema,
  })
  .strip()
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: "new password must be different from the current password",
    path: ["newPassword"],
  });

/**
 * Body for DELETE /api/account/providers — unlink an OAuth provider.
 * The provider name (e.g. "google", "github") is required and capped at
 * 50 characters to prevent oversized strings reaching the DB.
 */
export const AccountProviderUnlinkSchema = z
  .object({
    provider: z.preprocess(
      toStringOrEmpty,
      z.string().trim().min(1, "provider is required").max(50, "provider name too long"),
    ),
  })
  .strip();
