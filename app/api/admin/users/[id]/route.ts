import { requireAdmin } from "../../../../../lib/api-guards";
import { withApiHandler } from "../../../../../lib/api-handler";
import { ok } from "../../../../../lib/api-response";
import { AdminUserUpdateSchema } from "../../../../../lib/contracts/admin";
import { parseBody } from "../../../../../lib/http/validation";
import { updateAdminUser } from "../../../../../modules/admin/index.server";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withApiHandler(
    {
      logLabel: "PATCH /api/admin/users/[id]",
      errorFallback: {
        code: "ADMIN_INTERNAL",
        message: "failed to update user",
        status: 500,
      },
    },
    async () => {
      const { userId } = await requireAdmin("ADMIN");
      const { id } = await params;
      const body = await parseBody(request, AdminUserUpdateSchema, {
        code: "ADMIN_VALIDATION",
      });
      return ok({ user: await updateAdminUser(userId, id, body) });
    },
  );
}
