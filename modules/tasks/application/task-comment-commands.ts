import { ApplicationError } from "../../shared/application/application-error";
import type { TaskCommentCommandPort } from "./task-comment-types";
import type { TaskActor } from "./task-types";

const normalizeContent = (content: string) => {
  const normalized = content.trim();
  if (!normalized) {
    throw new ApplicationError("COMMENT_BAD_REQUEST", "comment must not be empty", "bad_request");
  }
  return normalized;
};

/** Use cases for task comments; protocol and persistence stay behind the port. */
export const createTaskCommentCommands = (port: TaskCommentCommandPort) => ({
  list: (workspaceId: string, taskId: string) => port.list(workspaceId, taskId),
  create: (actor: TaskActor, taskId: string, content: string) =>
    port.create(actor, taskId, normalizeContent(content)),
  update: (actor: TaskActor, taskId: string, commentId: string, content: string) =>
    port.update(actor, taskId, commentId, normalizeContent(content)),
  delete: (actor: TaskActor, taskId: string, commentId: string) =>
    port.delete(actor, taskId, commentId),
});
