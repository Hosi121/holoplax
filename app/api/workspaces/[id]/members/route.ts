import { requireAuth } from "../../../../../lib/api-auth";
import { handleAuthError, ok } from "../../../../../lib/api-response";
import { logAudit } from "../../../../../lib/audit";
import { WorkspaceMemberAddSchema } from "../../../../../lib/contracts/workspace";
import { createDomainErrors, errorResponse } from "../../../../../lib/http/errors";
import { parseBody } from "../../../../../lib/http/validation";
import prisma from "../../../../../lib/prisma";

const canManage = async (workspaceId: string, userId: string) => {
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  return membership?.role === "owner" || membership?.role === "admin";
};

const errors = createDomainErrors("WORKSPACE");

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await requireAuth();
    const { id } = await params;
    const membership = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: id, userId } },
    });
    if (!membership) return errors.forbidden();
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
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    console.error("GET /api/workspaces/[id]/members error", error);
    return errorResponse(error, {
      code: "WORKSPACE_INTERNAL",
      message: "failed to load members",
      status: 500,
    });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await requireAuth();
    const { id } = await params;
    if (!(await canManage(id, userId))) return errors.forbidden();

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
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    console.error("POST /api/workspaces/[id]/members error", error);
    return errorResponse(error, {
      code: "WORKSPACE_INTERNAL",
      message: "failed to add member",
      status: 500,
    });
  }
}
