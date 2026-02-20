import { requireAuth } from "../../../lib/api-auth";
import { withApiHandler } from "../../../lib/api-handler";
import { ok } from "../../../lib/api-response";
import { logAudit } from "../../../lib/audit";
import { WorkspaceCreateSchema } from "../../../lib/contracts/workspace";
import { parseBody } from "../../../lib/http/validation";
import prisma from "../../../lib/prisma";

export async function GET() {
  return withApiHandler(
    {
      logLabel: "GET /api/workspaces",
      errorFallback: {
        code: "WORKSPACE_INTERNAL",
        message: "failed to load workspaces",
        status: 500,
      },
    },
    async () => {
      const { userId } = await requireAuth();
      const memberships = await prisma.workspaceMember.findMany({
        where: { userId },
        select: {
          role: true,
          workspace: { select: { id: true, name: true, ownerId: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      return ok({
        workspaces: memberships.map((m) => ({
          id: m.workspace.id,
          name: m.workspace.name,
          role: m.role,
          ownerId: m.workspace.ownerId,
        })),
      });
    },
  );
}

export async function POST(request: Request) {
  return withApiHandler(
    {
      logLabel: "POST /api/workspaces",
      errorFallback: {
        code: "WORKSPACE_INTERNAL",
        message: "failed to create workspace",
        status: 500,
      },
    },
    async () => {
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
        select: { id: true, name: true, ownerId: true, createdAt: true },
      });
      await logAudit({
        actorId: userId,
        action: "WORKSPACE_CREATE",
        targetWorkspaceId: workspace.id,
        metadata: { name },
      });
      return ok({ workspace });
    },
  );
}
