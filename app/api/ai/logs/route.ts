import { withApiHandler } from "../../../../lib/api-handler";
import { requireWorkspaceAuth } from "../../../../lib/api-guards";
import { ok } from "../../../../lib/api-response";
import prisma from "../../../../lib/prisma";

export async function GET() {
  return withApiHandler(
    {
      logLabel: "GET /api/ai/logs",
      errorFallback: {
        code: "AI_INTERNAL",
        message: "failed to load logs",
        status: 500,
      },
    },
    async () => {
      const { workspaceId } = await requireWorkspaceAuth();
      if (!workspaceId) {
        return ok({ logs: [] });
      }
      const logs = await prisma.aiSuggestion.findMany({
        where: { workspaceId },
        orderBy: { createdAt: "desc" },
        take: 20,
      });
      return ok({ logs });
    },
  );
}
