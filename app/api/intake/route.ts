import { requireWorkspaceAuth } from "../../../lib/api-guards";
import { withApiHandler } from "../../../lib/api-handler";
import { ok } from "../../../lib/api-response";
import prisma from "../../../lib/prisma";

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
      const { userId, workspaceId } = await requireWorkspaceAuth();

      const [globalItems, workspaceItems] = await Promise.all([
        prisma.intakeItem.findMany({
          where: { userId, workspaceId: null, status: "PENDING" },
          orderBy: { createdAt: "desc" },
          take: 100,
        }),
        workspaceId
          ? prisma.intakeItem.findMany({
              where: { workspaceId, status: "PENDING" },
              orderBy: { createdAt: "desc" },
              take: 100,
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
