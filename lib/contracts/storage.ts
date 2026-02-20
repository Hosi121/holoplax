import { z } from "zod";

const toStringOrEmpty = (value: unknown) => (value == null ? "" : String(value));
const nonEmptyString = (message: string) =>
  z.preprocess(toStringOrEmpty, z.string().trim().min(1, message));

/**
 * MIME types permitted for avatar uploads.
 * Only web-safe image formats are allowed.  Any other contentType will cause
 * the S3 pre-signed URL request to be rejected before it reaches the storage
 * layer, preventing upload of HTML, JavaScript, SVG-with-script, or other
 * potentially dangerous file types.
 */
export const ALLOWED_AVATAR_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/avif",
] as const;

export type AllowedAvatarMimeType = (typeof ALLOWED_AVATAR_MIME_TYPES)[number];

/** Maximum avatar file size accepted by the API (5 MiB). */
export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

export const AvatarUploadSchema = z
  .object({
    filename: nonEmptyString("filename is required"),
    contentType: z
      .preprocess(toStringOrEmpty, z.string().trim())
      .refine(
        (v): v is AllowedAvatarMimeType =>
          (ALLOWED_AVATAR_MIME_TYPES as readonly string[]).includes(v),
        {
          message: `contentType must be one of: ${ALLOWED_AVATAR_MIME_TYPES.join(", ")}`,
        },
      ),
    /** File size in bytes; used to lock the Content-Length in the pre-signed PUT URL. */
    size: z
      .number()
      .int("size must be an integer")
      .positive("size must be positive")
      .max(MAX_AVATAR_BYTES, `size must not exceed ${MAX_AVATAR_BYTES} bytes (5 MiB)`),
  })
  .strip();
