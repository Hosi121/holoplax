import { requireAuth } from "../../../../../lib/api-auth";
import {
  badRequest,
  handleAuthError,
  ok,
  serverError,
  forbidden,
} from "../../../../../lib/api-response";
import { logAudit } from "../../../../../lib/audit";
import prisma from "../../../../../lib/prisma";

const canManage = async (workspaceId: string, userId: string) => {
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  return membership?.role === "owner" || membership?.role === "admin";
};

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
    if (!membership) return forbidden();
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
    return serverError("failed to load members");
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await requireAuth();
    const { id } = await params;
    if (!(await canManage(id, userId))) return forbidden();

    const body = await request.json();
    const email = String(body.email ?? "").toLowerCase().trim();
    const role = String(body.role ?? "member").toLowerCase();
    if (!email) return badRequest("email is required");

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return badRequest("user not found");
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
    return serverError("failed to add member");
  }
}
