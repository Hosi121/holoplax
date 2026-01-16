import { requireAuth } from "../../../lib/api-auth";
import {
  badRequest,
  handleAuthError,
  ok,
  serverError,
} from "../../../lib/api-response";
import { logAudit } from "../../../lib/audit";
import prisma from "../../../lib/prisma";
import { resolveWorkspaceId } from "../../../lib/workspace-context";

export async function GET() {
  try {
    const { userId } = await requireAuth();
    const workspaceId = await resolveWorkspaceId(userId);
    if (!workspaceId) {
      return ok({ velocity: [] });
    }
    const velocity = await prisma.velocityEntry.findMany({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
    });
    return ok({ velocity });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    console.error("GET /api/velocity error", error);
    return serverError("failed to load velocity");
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await requireAuth();
    const workspaceId = await resolveWorkspaceId(userId);
    if (!workspaceId) {
      return badRequest("workspace is required");
    }
    const body = await request.json();
    const { name, points, range } = body;
    if (!name || !points || !range) {
      return badRequest("name, points, range are required");
    }
    const entry = await prisma.velocityEntry.create({
      data: {
        name,
        points: Number(points),
        range,
        userId,
        workspaceId,
      },
    });
    await logAudit({
      actorId: userId,
      action: "VELOCITY_CREATE",
      targetWorkspaceId: workspaceId,
      metadata: { entryId: entry.id, points: entry.points },
    });
    return ok({ entry });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    console.error("POST /api/velocity error", error);
    return serverError("failed to create entry");
  }
}
