import { z } from "zod";
import { EmailSchema } from "./auth";

const toStringOrEmpty = (value: unknown) => (value == null ? "" : String(value));

export const WorkspaceRoleSchema = z.enum(["owner", "admin", "member"]);

const WorkspaceRoleInputSchema = z
  .preprocess(toStringOrEmpty, z.string().trim())
  .transform((value) => value.toLowerCase())
  .pipe(WorkspaceRoleSchema);

export const WorkspaceCreateSchema = z
  .object({
    name: z.preprocess(toStringOrEmpty, z.string().trim().min(1, "name is required")),
  })
  .passthrough();

export const WorkspaceCurrentSchema = z
  .object({
    workspaceId: z.preprocess(
      toStringOrEmpty,
      z.string().trim().min(1, "workspaceId is required"),
    ),
  })
  .passthrough();

export const WorkspaceInviteCreateSchema = z
  .object({
    email: EmailSchema,
    role: WorkspaceRoleInputSchema.optional(),
  })
  .passthrough();

export const WorkspaceInviteAcceptSchema = z
  .object({
    token: z.preprocess(toStringOrEmpty, z.string().trim().min(1, "token is required")),
  })
  .passthrough();

export const WorkspaceMemberAddSchema = z
  .object({
    email: EmailSchema,
    role: WorkspaceRoleInputSchema.optional(),
  })
  .passthrough();

export const WorkspaceMemberRoleUpdateSchema = z
  .object({
    role: WorkspaceRoleInputSchema,
  })
  .passthrough();
