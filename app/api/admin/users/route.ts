import { requireAuth } from "../../../../lib/api-auth";
import { forbidden, handleAuthError, ok, serverError } from "../../../../lib/api-response";
import prisma from "../../../../lib/prisma";

export async function GET() {
  try {
    const { role } = await requireAuth();
    if (role !== "ADMIN") {
      return forbidden();
    }
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });
    return ok({ users });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    console.error("GET /api/admin/users error", error);
    return serverError("failed to load users");
  }
}
