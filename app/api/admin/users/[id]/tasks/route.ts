import { requireAdmin } from "../../../../../../lib/api-guards";
import { withApiHandler } from "../../../../../../lib/api-handler";
import { ok } from "../../../../../../lib/api-response";
import { listAdminUserTasks } from "../../../../../../modules/admin/index.server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withApiHandler(
    {
      logLabel: "GET /api/admin/users/[id]/tasks",
      errorFallback: {
        code: "ADMIN_INTERNAL",
        message: "failed to load tasks",
        status: 500,
      },
    },
    async () => {
      await requireAdmin("ADMIN");
      const { id } = await params;
      return ok({ tasks: await listAdminUserTasks(id) });
    },
  );
}
