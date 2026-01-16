import { requireAuth } from "../../../lib/api-auth";
import { badRequest, handleAuthError, ok, serverError } from "../../../lib/api-response";
import { logAudit } from "../../../lib/audit";
import prisma from "../../../lib/prisma";

export async function GET() {
  try {
    const { userId } = await requireAuth();
    const memberships = await prisma.workspaceMember.findMany({
      where: { userId },
      include: { workspace: true },
      orderBy: { createdAt: "desc" },
    });
    return ok({
      workspaces: memberships.map((m) => ({
        id: m.workspace.id,
        name: m.workspace.name,
        role: m.role,
        ownerId: m.workspace.ownerId,
      })),
    });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    console.error("GET /api/workspaces error", error);
    return serverError("failed to load workspaces");
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await requireAuth();
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    if (!name) {
      return badRequest("name is required");
    }
    const workspace = await prisma.workspace.create({
      data: {
        name,
        ownerId: userId,
        members: {
          create: { userId, role: "owner" },
        },
      },
    });
    await logAudit({
      actorId: userId,
      action: "WORKSPACE_CREATE",
      targetWorkspaceId: workspace.id,
      metadata: { name },
    });
    return ok({ workspace });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    console.error("POST /api/workspaces error", error);
    return serverError("failed to create workspace");
  }
}
