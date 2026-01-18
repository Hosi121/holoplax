import { requireAuth } from "../../../../../lib/api-auth";
import { handleAuthError, ok } from "../../../../../lib/api-response";
import { logAudit } from "../../../../../lib/audit";
import { AdminUserUpdateSchema } from "../../../../../lib/contracts/admin";
import { createDomainErrors, errorResponse } from "../../../../../lib/http/errors";
import { parseBody } from "../../../../../lib/http/validation";
import prisma from "../../../../../lib/prisma";
import { UserRole } from "@prisma/client";

const errors = createDomainErrors("ADMIN");

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { role, userId } = await requireAuth();
    if (role !== "ADMIN") {
      return errors.forbidden();
    }
    const { id } = await params;
    const body = await parseBody(request, AdminUserUpdateSchema, {
      code: "ADMIN_VALIDATION",
    });
    const nextRole = body.role ? String(body.role).toUpperCase() : null;
    const disabled = body.disabled;

    if (nextRole && !["ADMIN", "USER"].includes(nextRole)) {
      return errors.badRequest("invalid role");
    }

    const updated = await prisma.user.update({
      where: { id },
      data: {
        role: nextRole as UserRole ?? undefined,
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
    return errorResponse(error, {
      code: "ADMIN_INTERNAL",
      message: "failed to update user",
      status: 500,
    });
  }
}
