import { requireWorkspaceAuth } from "../../../lib/api-guards";
import { withApiHandler } from "../../../lib/api-handler";
import { ok } from "../../../lib/api-response";
import { selectDailyFocus } from "../../../lib/daily-focus";
import { TASK_STATUS } from "../../../lib/types";
import { listTasks } from "../../../modules/tasks/index.server";

export async function GET() {
  return withApiHandler(
    {
      logLabel: "GET /api/focus-queue",
      errorFallback: {
        code: "FOCUS_QUEUE_INTERNAL",
        message: "failed to load focus queue",
        status: 500,
      },
    },
    async () => {
      const { workspaceId } = await requireWorkspaceAuth();
      if (!workspaceId) {
        return ok({ items: [], computedAt: null });
      }

      const { tasks } = await listTasks(workspaceId, {
        statuses: [TASK_STATUS.SPRINT],
        limit: 200,
      });
      const focus = selectDailyFocus(tasks, { maxTasks: 3, maxPoints: 8 });
      const items = focus.focusTasks.map(({ task, score, reasons }) => ({
        taskId: task.id,
        title: task.title,
        dueDate: task.dueDate ? new Date(task.dueDate).toISOString() : null,
        priorityScore: score,
        reason: reasons[0] ?? "着手しやすい",
      }));

      return ok({
        items,
        computedAt: new Date().toISOString(),
      });
    },
  );
}
