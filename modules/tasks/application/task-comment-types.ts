import type { TaskActor } from "./task-types";

export type TaskCommentAuthor = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
};

export type TaskCommentRecord = {
  id: string;
  taskId: string;
  authorId: string;
  workspaceId: string;
  content: string;
  editedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  author: TaskCommentAuthor;
};

export type TaskCommentCommandPort = {
  list(workspaceId: string, taskId: string): Promise<TaskCommentRecord[]>;
  create(actor: TaskActor, taskId: string, content: string): Promise<TaskCommentRecord>;
  update(
    actor: TaskActor,
    taskId: string,
    commentId: string,
    content: string,
  ): Promise<TaskCommentRecord>;
  delete(actor: TaskActor, taskId: string, commentId: string): Promise<void>;
};
