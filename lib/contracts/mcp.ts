import { z } from "zod";

const toStringOrEmpty = (value: unknown) => (value == null ? "" : String(value));

/**
 * Body accepted by POST /api/mcp/keys.
 *
 * - name: human-readable label for the key (required, 1–100 chars after trim)
 * - workspaceId: the workspace this key will be scoped to (required, non-empty)
 * - expiresInDays: optional positive integer ≤ 365; omit for no expiry
 */
export const McpKeyCreateSchema = z
  .object({
    name: z.preprocess(
      toStringOrEmpty,
      z.string().trim().min(1, "name is required").max(100, "name must be 100 characters or fewer"),
    ),
    workspaceId: z.preprocess(toStringOrEmpty, z.string().trim().min(1, "workspaceId is required")),
    expiresInDays: z
      .number()
      .int("expiresInDays must be an integer")
      .positive("expiresInDays must be positive")
      .max(365, "expiresInDays cannot exceed 365")
      .optional(),
  })
  .strip();

export type McpKeyCreateInput = z.infer<typeof McpKeyCreateSchema>;
