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

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { role, userId } = await requireAuth();
    if (role !== "ADMIN") {
      return forbidden();
    }
    const { id } = await params;
    const body = await request.json();
    const nextRole = body.role ? String(body.role).toUpperCase() : null;
    const disabled = body.disabled;

    if (nextRole && !["ADMIN", "USER"].includes(nextRole)) {
      return badRequest("invalid role");
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        role: nextRole ?? undefined,
        disabledAt: typeof disabled === "boolean" ? (disabled ? new Date() : null) : undefined,
      },
      select: { id: true, name: true, email: true, role: true, disabledAt: true },
    });

    await logAudit({
      actorId: userId,
      action: "ADMIN_USER_UPDATE",
      targetUserId: id,
      metadata: {
        role: updated.role,
        disabled: Boolean(updated.disabledAt),
      },
    });

    return ok({ user: updated });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    console.error("PATCH /api/admin/users/[id] error", error);
    return serverError("failed to update user");
  }
}
