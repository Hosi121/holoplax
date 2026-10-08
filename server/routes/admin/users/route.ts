import { requireAdmin } from "../../../../lib/api-guards";
import { withApiHandler } from "../../../../lib/api-handler";
import { ok } from "../../../../lib/api-response";
import { AdminUserCreateSchema } from "../../../../lib/contracts/admin";
import { parseBody } from "../../../../lib/http/validation";
import { createAdminUser, listAdminUsers } from "../../../../modules/admin/index.server";

export async function GET(request: Request) {
  return withApiHandler(
    {
      logLabel: "GET /api/admin/users",
      errorFallback: {
        code: "ADMIN_INTERNAL",
        message: "failed to load users",
        status: 500,
      },
    },
    async () => {
      await requireAdmin("ADMIN");
      const { searchParams } = new URL(request.url);
      // Cursor-based pagination. Default page size 100, max 500.
      // Pass ?cursor=<lastUserId> to fetch the next page.
      const cursor = searchParams.get("cursor") ?? undefined;
      const rawLimit = Number.parseInt(searchParams.get("limit") ?? "100", 10);
      const limit = Number.isNaN(rawLimit) || rawLimit <= 0 ? 100 : Math.min(rawLimit, 500);

      return ok(await listAdminUsers({ cursor, limit }));
    },
  );
}

export async function POST(request: Request) {
  return withApiHandler(
    {
      logLabel: "POST /api/admin/users",
      errorFallback: {
        code: "ADMIN_INTERNAL",
        message: "failed to create user",
        status: 500,
      },
    },
    async () => {
      const { userId } = await requireAdmin("ADMIN");

      const body = await parseBody(request, AdminUserCreateSchema, {
        code: "ADMIN_VALIDATION",
      });
      return ok({ user: await createAdminUser(userId, body) });
    },
  );
}
