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
