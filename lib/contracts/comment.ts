import { z } from "zod";

export const CommentCreateSchema = z.object({
  content: z.string().min(1, "コメントを入力してください").max(10000),
});

export const CommentUpdateSchema = z.object({
  content: z.string().min(1, "コメントを入力してください").max(10000),
});

export type CommentDTO = {
  id: string;
  taskId: string;
  authorId: string;
  workspaceId: string;
  content: string;
  editedAt: string | null;
  createdAt: string;
  updatedAt: string;
  author: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
  };
};
