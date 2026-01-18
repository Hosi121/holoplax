import { requireAuth } from "../../../lib/api-auth";
import { handleAuthError, ok } from "../../../lib/api-response";
import { logAudit } from "../../../lib/audit";
import { WorkspaceCreateSchema } from "../../../lib/contracts/workspace";
import { errorResponse } from "../../../lib/http/errors";
import { parseBody } from "../../../lib/http/validation";
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
    return errorResponse(error, {
      code: "WORKSPACE_INTERNAL",
      message: "failed to load workspaces",
      status: 500,
    });
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await requireAuth();
    const body = await parseBody(request, WorkspaceCreateSchema, {
      code: "WORKSPACE_VALIDATION",
    });
    const name = body.name;
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
    return errorResponse(error, {
      code: "WORKSPACE_INTERNAL",
      message: "failed to create workspace",
      status: 500,
    });
  }
}
