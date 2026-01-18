import { requireAuth } from "../../../lib/api-auth";
import { withApiHandler } from "../../../lib/api-handler";
import { ok } from "../../../lib/api-response";
import prisma from "../../../lib/prisma";
import { resolveWorkspaceId } from "../../../lib/workspace-context";

export async function GET() {
  return withApiHandler(
    {
      logLabel: "GET /api/intake",
      errorFallback: {
        code: "INTAKE_INTERNAL",
        message: "failed to load intake items",
        status: 500,
      },
    },
    async () => {
      const { userId } = await requireAuth();
      const workspaceId = await resolveWorkspaceId(userId);

      const [globalItems, workspaceItems] = await Promise.all([
        prisma.intakeItem.findMany({
          where: { userId, workspaceId: null, status: "PENDING" },
          orderBy: { createdAt: "desc" },
        }),
        workspaceId
          ? prisma.intakeItem.findMany({
              where: { workspaceId, status: "PENDING" },
              orderBy: { createdAt: "desc" },
            })
          : Promise.resolve([]),
      ]);

      return ok({
        currentWorkspaceId: workspaceId,
        globalItems,
        workspaceItems,
      });
    },
  );
}
