import { requireAuth } from "../../../lib/api-auth";
import { handleAuthError, ok, serverError } from "../../../lib/api-response";
import prisma from "../../../lib/prisma";
import { resolveWorkspaceId } from "../../../lib/workspace-context";

export async function GET() {
  try {
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
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    console.error("GET /api/intake error", error);
    return serverError("failed to load intake items");
  }
}
