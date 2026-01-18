import { hash } from "bcryptjs";
import { withApiHandler } from "../../../../lib/api-handler";
import { requireAdmin } from "../../../../lib/api-guards";
import { ok } from "../../../../lib/api-response";
import { logAudit } from "../../../../lib/audit";
import { AdminUserCreateSchema } from "../../../../lib/contracts/admin";
import { createDomainErrors } from "../../../../lib/http/errors";
import { parseBody } from "../../../../lib/http/validation";
import prisma from "../../../../lib/prisma";
import { UserRole } from "@prisma/client";

const errors = createDomainErrors("ADMIN");

export async function GET() {
  return withApiHandler(
    {
      logLabel: "GET /api/admin/users",
      errorFallback: {
        code: "ADMIN_INTERNAL",
        message: "failed to load users",
        status: 500,
      },
    },
    async () => {
      await requireAdmin("ADMIN");
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
    },
  );
}

export async function POST(request: Request) {
  return withApiHandler(
    {
      logLabel: "POST /api/admin/users",
      errorFallback: {
        code: "ADMIN_INTERNAL",
        message: "failed to create user",
        status: 500,
      },
    },
    async () => {
      const { userId } = await requireAdmin("ADMIN");

      const body = await parseBody(request, AdminUserCreateSchema, {
        code: "ADMIN_VALIDATION",
      });
      const email = body.email;
      const password = body.password;
      const name = String(body.name ?? "").trim();
      const nextRole = body.role ? String(body.role).toUpperCase() : "USER";

      if (!["ADMIN", "USER"].includes(nextRole)) {
        return errors.badRequest("invalid role");
      }

      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        return errors.conflict("email already registered");
      }

      const hashed = await hash(password, 10);
      const created = await prisma.user.create({
        data: {
          email,
          name: name || null,
          role: nextRole as UserRole,
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
    },
  );
}
