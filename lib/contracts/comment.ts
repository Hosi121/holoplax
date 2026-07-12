import { z } from "zod";

export const CommentCreateSchema = z
  .object({
    content: z.string().min(1, "コメントを入力してください").max(10000),
  })
  .strip();

export const CommentUpdateSchema = z
  .object({
    content: z.string().min(1, "コメントを入力してください").max(10000),
  })
  .strip();
