import { requireAdmin } from "../../../../lib/api-guards";
import { withApiHandler } from "../../../../lib/api-handler";
import { ok } from "../../../../lib/api-response";
import { runAdminMaintenance } from "../../../../modules/admin/index.server";

/**
 * POST /api/admin/maintenance
 *
 * Deletes expired authentication tokens and workspace invites that have
 * accumulated in the database.  This should be called by a scheduled job
 * (e.g. a cron trigger or external scheduler) to keep the tables lean.
 *
 * Secured to admin users only.  Safe to run multiple times (idempotent).
 */
export async function POST() {
  return withApiHandler(
    {
      logLabel: "POST /api/admin/maintenance",
      errorFallback: {
        code: "ADMIN_MAINTENANCE_INTERNAL",
        message: "maintenance job failed",
        status: 500,
      },
    },
    async () => {
      const { userId } = await requireAdmin("ADMIN");
      const deleted = await runAdminMaintenance(userId);
      return ok({ ok: true, deleted });
    },
  );
}
