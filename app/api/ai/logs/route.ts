import { requireAuth } from "../../../../lib/api-auth";
import { handleAuthError, ok } from "../../../../lib/api-response";
import { errorResponse } from "../../../../lib/http/errors";
import prisma from "../../../../lib/prisma";
import { resolveWorkspaceId } from "../../../../lib/workspace-context";

export async function GET() {
  try {
    const { userId } = await requireAuth();
    const workspaceId = await resolveWorkspaceId(userId);
    if (!workspaceId) {
      return ok({ logs: [] });
    }
    const logs = await prisma.aiSuggestion.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return ok({ logs });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    console.error("GET /api/ai/logs error", error);
    return errorResponse(error, {
      code: "AI_INTERNAL",
      message: "failed to load logs",
      status: 500,
    });
  }
}
