import { requireAdmin } from "../../../../lib/api-guards";
import { withApiHandler } from "../../../../lib/api-handler";
import { ok } from "../../../../lib/api-response";
import { AdminAiUpdateSchema } from "../../../../lib/contracts/admin";
import { parseBody } from "../../../../lib/http/validation";
import { getAdminAiSetting, updateAdminAiSetting } from "../../../../modules/admin/index.server";

export async function GET() {
  return withApiHandler(
    {
      logLabel: "GET /api/admin/ai",
      errorFallback: {
        code: "ADMIN_INTERNAL",
        message: "failed to load ai settings",
        status: 500,
      },
    },
    async () => {
      await requireAdmin("ADMIN");
      return ok({ setting: await getAdminAiSetting() });
    },
  );
}

export async function POST(request: Request) {
  return withApiHandler(
    {
      logLabel: "POST /api/admin/ai",
      errorFallback: {
        code: "ADMIN_INTERNAL",
        message: "failed to update ai settings",
        status: 500,
      },
    },
    async () => {
      const { userId } = await requireAdmin("ADMIN");
      const body = await parseBody(request, AdminAiUpdateSchema, {
        code: "ADMIN_VALIDATION",
        allowEmpty: true,
      });
      return ok({ setting: await updateAdminAiSetting(userId, body) });
    },
  );
}
