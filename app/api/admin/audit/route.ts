import { resolveRange } from "../../../../lib/ai-usage/stats";
import { requireAdmin } from "../../../../lib/api-guards";
import { withApiHandler } from "../../../../lib/api-handler";
import { ok } from "../../../../lib/api-response";
import { createDomainErrors } from "../../../../lib/http/errors";
import { getAdminAudit } from "../../../../modules/admin/index.server";

const errors = createDomainErrors("ADMIN");

export async function GET(request: Request) {
  return withApiHandler(
    {
      logLabel: "GET /api/admin/audit",
      errorFallback: {
        code: "ADMIN_INTERNAL",
        message: "failed to load audit logs",
        status: 500,
      },
    },
    async () => {
      await requireAdmin("ADMIN");
      const { searchParams } = new URL(request.url);
      const filter = searchParams.get("filter");
      const format = searchParams.get("format");
      const range = resolveRange(searchParams);
      if (!range) {
        return errors.badRequest("invalid range");
      }
      const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? 200), 1), 500);
      const result = await getAdminAudit({ filter, format, range, limit });
      if (result.kind === "csv") {
        return new Response(result.csv, {
          status: 200,
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="ai-usage-${result.fileLabel.replace(
              /[^0-9-]/g,
              "_",
            )}.csv"`,
          },
        });
      }
      return ok({ logs: result.logs, stats: result.stats });
    },
  );
}
