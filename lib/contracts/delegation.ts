import { z } from "zod";

export const DelegationCreateSchema = z
  .object({
    request: z.string().trim().min(3).max(5000),
    mode: z.enum(["PREPARE", "SAFE_AUTO"]).default("SAFE_AUTO"),
  })
  .strip();

export const DelegationActionSchema = z
  .object({
    action: z.enum(["cancel", "prepare", "retry"]),
  })
  .strip();
