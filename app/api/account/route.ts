import { AuthError, requireAuth } from "../../../lib/api-auth";
import { conflict, handleAuthError, ok, serverError } from "../../../lib/api-response";
import prisma from "../../../lib/prisma";

export async function GET() {
  try {
    const { userId } = await requireAuth();
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, image: true },
    });
    return ok({ user });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    console.error("GET /api/account error", error);
    return serverError("failed to load account");
  }
}

export async function PATCH(request: Request) {
  try {
    const { userId } = await requireAuth();
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").toLowerCase().trim();
    const image = String(body.image ?? "").trim();

    if (email) {
      const existing = await prisma.user.findFirst({
        where: { email, NOT: { id: userId } },
      });
      if (existing) {
        return conflict("email already in use");
      }
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        name: name || null,
        email: email || null,
        image: image || null,
      },
      select: { id: true, name: true, email: true, image: true },
    });
    return ok({ user: updated });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    console.error("PATCH /api/account error", error);
    return serverError("failed to update account");
  }
}
