import { requireWorkspaceAuth } from "../../../../lib/api-guards";
import { withApiHandler } from "../../../../lib/api-handler";
import { ok } from "../../../../lib/api-response";
import { TaskUpdateSchema } from "../../../../lib/contracts/task";
import { createDomainErrors } from "../../../../lib/http/errors";
import { parseBody } from "../../../../lib/http/validation";
import { deleteTask, updateTask } from "../../../../lib/tasks/task-service";

const errors = createDomainErrors("TASK");

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withApiHandler(
    {
      logLabel: "PATCH /api/tasks/[id]",
      errorFallback: {
        code: "TASK_INTERNAL",
        message: "failed to update task",
        status: 500,
      },
    },
    async () => {
      const { id } = await params;
      const input = await parseBody(request, TaskUpdateSchema, { code: "TASK_VALIDATION" });
      const { userId, workspaceId } = await requireWorkspaceAuth();
      if (!workspaceId) {
        return errors.notFound("workspace not selected");
      }
      const task = await updateTask({ userId, workspaceId, taskId: id, input });
      return ok({ task });
    },
  );
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withApiHandler(
    {
      logLabel: "DELETE /api/tasks/[id]",
      errorFallback: {
        code: "TASK_INTERNAL",
        message: "failed to delete task",
        status: 500,
      },
    },
    async () => {
      const { id } = await params;
      const { userId, workspaceId } = await requireWorkspaceAuth();
      if (!workspaceId) {
        return errors.notFound("workspace not selected");
      }
      await deleteTask({ userId, workspaceId, taskId: id });
      return ok({ ok: true });
    },
  );
}
