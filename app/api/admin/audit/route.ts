import { requireAuth } from "../../../../lib/api-auth";
import { forbidden, handleAuthError, ok, serverError } from "../../../../lib/api-response";
import prisma from "../../../../lib/prisma";

export async function GET() {
  try {
    const { role } = await requireAuth();
    if (role !== "ADMIN") {
      return forbidden();
    }
    const logs = await prisma.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        actor: { select: { name: true, email: true } },
        targetUser: { select: { name: true, email: true } },
        targetWorkspace: { select: { name: true } },
      },
    });
    return ok({ logs });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    console.error("GET /api/admin/audit error", error);
    return serverError("failed to load audit logs");
  }
}
