import { requireWorkspaceAuth } from "../../../lib/api-guards";
import { withApiHandler } from "../../../lib/api-handler";
import { ok } from "../../../lib/api-response";
import { TaskCreateSchema } from "../../../lib/contracts/task";
import { parseBody } from "../../../lib/http/validation";
import { listTasks } from "../../../lib/tasks/task-query";
import { createTask } from "../../../lib/tasks/task-service";
import { isSeverity, isTaskStatus, isTaskType } from "../../../lib/tasks/task-values";

const parseDate = (value: string | null): Date | undefined => {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

export async function GET(request: Request) {
  return withApiHandler(
    {
      logLabel: "GET /api/tasks",
      errorFallback: {
        code: "TASK_INTERNAL",
        message: "failed to load tasks",
        status: 500,
      },
    },
    async () => {
      const { workspaceId } = await requireWorkspaceAuth();
      if (!workspaceId) {
        return ok({ tasks: [], nextCursor: null, hasMore: false, page: 0 });
      }

      const { searchParams } = new URL(request.url);
      const statuses = searchParams
        .getAll("status")
        .map((value) => value.trim())
        .filter(isTaskStatus);
      const types = (searchParams.get("type")?.split(",") ?? [])
        .map((value) => value.trim())
        .filter(isTaskType);
      const urgency = searchParams.get("urgency");
      const risk = searchParams.get("risk");

      const result = await listTasks(workspaceId, {
        statuses,
        types,
        urgency: isSeverity(urgency) ? urgency : undefined,
        risk: isSeverity(risk) ? risk : undefined,
        tags: searchParams.get("tags")?.split(",").filter(Boolean),
        assigneeId: searchParams.get("assigneeId") ?? undefined,
        dueBefore: parseDate(searchParams.get("dueBefore")),
        dueAfter: parseDate(searchParams.get("dueAfter")),
        minPoints: Number(searchParams.get("minPoints")),
        maxPoints: Number(searchParams.get("maxPoints")),
        search: searchParams.get("q")?.trim() || undefined,
        limit: Number(searchParams.get("limit") ?? "200"),
        cursor: searchParams.get("cursor") ?? undefined,
        page: Number(searchParams.get("page") ?? "0"),
      });
      return ok(result);
    },
  );
}

export async function POST(request: Request) {
  return withApiHandler(
    {
      logLabel: "POST /api/tasks",
      errorFallback: {
        code: "TASK_INTERNAL",
        message: "failed to create task",
        status: 500,
      },
    },
    async () => {
      const { userId, workspaceId } = await requireWorkspaceAuth({
        domain: "TASK",
        requireWorkspace: true,
      });
      const input = await parseBody(request, TaskCreateSchema, { code: "TASK_VALIDATION" });
      const task = await createTask({ userId, workspaceId, input });
      return ok({ task });
    },
  );
}
