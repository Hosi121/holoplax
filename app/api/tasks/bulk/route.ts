import { z } from "zod";
import { requireWorkspaceAuth } from "../../../../lib/api-guards";
import { withApiHandler } from "../../../../lib/api-handler";
import { ok } from "../../../../lib/api-response";
import { TaskPointsSchema } from "../../../../lib/contracts/task";
import { parseBody } from "../../../../lib/http/validation";
import { bulkUpdateTasks } from "../../../../modules/tasks/index.server";

const BulkActionSchema = z.object({
  action: z.enum(["status", "delete", "points"]),
  taskIds: z.array(z.string()).min(1).max(100),
  status: z.enum(["BACKLOG", "SPRINT", "DONE"]).optional(),
  points: TaskPointsSchema.optional(),
});

export async function POST(request: Request) {
  return withApiHandler(
    {
      logLabel: "POST /api/tasks/bulk",
      errorFallback: {
        code: "TASK_INTERNAL",
        message: "failed to perform bulk operation",
        status: 500,
      },
    },
    async () => {
      const actor = await requireWorkspaceAuth({ domain: "TASK", requireWorkspace: true });
      const command = await parseBody(request, BulkActionSchema, { code: "TASK_VALIDATION" });
      return ok(await bulkUpdateTasks(actor, command));
    },
  );
}
