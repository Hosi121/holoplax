import { hash } from "bcryptjs";
import { requireAuth } from "../../../../lib/api-auth";
import {
  badRequest,
  conflict,
  forbidden,
  handleAuthError,
  ok,
  serverError,
} from "../../../../lib/api-response";
import { logAudit } from "../../../../lib/audit";
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
        disabledAt: true,
        createdAt: true,
        memberships: {
          select: {
            role: true,
            workspace: {
              select: { id: true, name: true },
            },
          },
        },
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

export async function POST(request: Request) {
  try {
    const { role, userId } = await requireAuth();
    if (role !== "ADMIN") {
      return forbidden();
    }

    const body = await request.json();
    const email = String(body.email ?? "").toLowerCase().trim();
    const password = String(body.password ?? "");
    const name = String(body.name ?? "").trim();
    const nextRole = body.role ? String(body.role).toUpperCase() : "USER";

    if (!email || !password) {
      return badRequest("email and password are required");
    }
    if (password.length < 8) {
      return badRequest("password must be at least 8 characters");
    }
    if (!["ADMIN", "USER"].includes(nextRole)) {
      return badRequest("invalid role");
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return conflict("email already registered");
    }

    const hashed = await hash(password, 10);
    const created = await prisma.user.create({
      data: {
        email,
        name: name || null,
        role: nextRole,
        emailVerified: new Date(),
        password: { create: { hash: hashed } },
      },
      select: { id: true, name: true, email: true, role: true, disabledAt: true, createdAt: true },
    });

    await logAudit({
      actorId: userId,
      action: "ADMIN_USER_CREATE",
      targetUserId: created.id,
      metadata: { role: created.role },
    });

    return ok({ user: created });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    console.error("POST /api/admin/users error", error);
    return serverError("failed to create user");
  }
}
