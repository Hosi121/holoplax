import { randomBytes } from "crypto";
import { requireAuth } from "../../../../../lib/api-auth";
import {
  badRequest,
  forbidden,
  handleAuthError,
  ok,
  serverError,
} from "../../../../../lib/api-response";
import { logAudit } from "../../../../../lib/audit";
import prisma from "../../../../../lib/prisma";

const canManage = async (workspaceId: string, userId: string) => {
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  return membership?.role === "owner" || membership?.role === "admin";
};

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

    const token = randomBytes(24).toString("hex");
    const invite = await prisma.workspaceInvite.create({
      data: {
        workspaceId: id,
        email,
        role,
        token,
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
      },
    });
    const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
    const inviteUrl = `${baseUrl}/workspaces/invite?token=${invite.token}`;

    await logAudit({
      actorId: userId,
      action: "WORKSPACE_INVITE_CREATE",
      targetWorkspaceId: id,
      metadata: { email, role },
    });

    return ok({ inviteUrl, invite });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    console.error("POST /api/workspaces/[id]/invites error", error);
    return serverError("failed to create invite");
  }
}
