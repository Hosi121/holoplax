import { requireAuth } from "../../../lib/api-auth";
import { handleAuthError, ok } from "../../../lib/api-response";
import { AccountUpdateSchema } from "../../../lib/contracts/auth";
import { createDomainErrors, errorResponse } from "../../../lib/http/errors";
import { parseBody } from "../../../lib/http/validation";
import prisma from "../../../lib/prisma";

const errors = createDomainErrors("ACCOUNT");

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
    return errorResponse(error, {
      code: "ACCOUNT_INTERNAL",
      message: "failed to load account",
      status: 500,
    });
  }
}

export async function PATCH(request: Request) {
  try {
    const { userId } = await requireAuth();
    const body = await parseBody(request, AccountUpdateSchema, {
      code: "ACCOUNT_VALIDATION",
    });
    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").toLowerCase().trim();
    const image = String(body.image ?? "").trim();

    if (email) {
      const existing = await prisma.user.findFirst({
        where: { email, NOT: { id: userId } },
      });
      if (existing) {
        return errors.conflict("email already in use");
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
    return errorResponse(error, {
      code: "ACCOUNT_INTERNAL",
      message: "failed to update account",
      status: 500,
    });
  }
}
