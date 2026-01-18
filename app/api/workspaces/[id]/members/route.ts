import { requireAuth } from "../../../../../lib/api-auth";
import { withApiHandler } from "../../../../../lib/api-handler";
import { requireWorkspaceManager, requireWorkspaceMember } from "../../../../../lib/api-guards";
import { ok } from "../../../../../lib/api-response";
import { logAudit } from "../../../../../lib/audit";
import { WorkspaceMemberAddSchema } from "../../../../../lib/contracts/workspace";
import { createDomainErrors } from "../../../../../lib/http/errors";
import { parseBody } from "../../../../../lib/http/validation";
import prisma from "../../../../../lib/prisma";

const errors = createDomainErrors("WORKSPACE");

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withApiHandler(
    {
      logLabel: "GET /api/workspaces/[id]/members",
      errorFallback: {
        code: "WORKSPACE_INTERNAL",
        message: "failed to load members",
        status: 500,
      },
    },
    async () => {
      const { userId } = await requireAuth();
      const { id } = await params;
      await requireWorkspaceMember("WORKSPACE", id, userId);
      const members = await prisma.workspaceMember.findMany({
        where: { workspaceId: id },
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy: { createdAt: "asc" },
      });
      return ok({
        members: members.map((m) => ({
          id: m.user.id,
          name: m.user.name,
          email: m.user.email,
          role: m.role,
        })),
      });
    },
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withApiHandler(
    {
      logLabel: "POST /api/workspaces/[id]/members",
      errorFallback: {
        code: "WORKSPACE_INTERNAL",
        message: "failed to add member",
        status: 500,
      },
    },
    async () => {
      const { userId } = await requireAuth();
      const { id } = await params;
      await requireWorkspaceManager("WORKSPACE", id, userId);

      const body = await parseBody(request, WorkspaceMemberAddSchema, {
        code: "WORKSPACE_VALIDATION",
      });
      const email = body.email;
      const role = body.role ?? "member";

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        return errors.badRequest("user not found");
      }

      const membership = await prisma.workspaceMember.upsert({
        where: { workspaceId_userId: { workspaceId: id, userId: user.id } },
        update: { role },
        create: { workspaceId: id, userId: user.id, role },
      });

      await logAudit({
        actorId: userId,
        action: "WORKSPACE_MEMBER_ADD",
        targetWorkspaceId: id,
        targetUserId: user.id,
        metadata: { role: membership.role },
      });

      return ok({ member: membership });
    },
  );
}
