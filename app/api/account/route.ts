import { requireAuth } from "../../../lib/api-auth";
import { withApiHandler } from "../../../lib/api-handler";
import { ok } from "../../../lib/api-response";
import { logAudit } from "../../../lib/audit";
import { AccountUpdateSchema } from "../../../lib/contracts/auth";
import { createDomainErrors } from "../../../lib/http/errors";
import { parseBody } from "../../../lib/http/validation";
import prisma from "../../../lib/prisma";

const errors = createDomainErrors("ACCOUNT");

export async function GET() {
  return withApiHandler(
    {
      logLabel: "GET /api/account",
      errorFallback: {
        code: "ACCOUNT_INTERNAL",
        message: "failed to load account",
        status: 500,
      },
    },
    async () => {
      const { userId } = await requireAuth();
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          accounts: {
            select: {
              provider: true,
              providerAccountId: true,
            },
          },
        },
      });
      const linkedProviders = user?.accounts.map((a) => a.provider) ?? [];
      return ok({ user, linkedProviders });
    },
  );
}

export async function PATCH(request: Request) {
  return withApiHandler(
    {
      logLabel: "PATCH /api/account",
      errorFallback: {
        code: "ACCOUNT_INTERNAL",
        message: "failed to update account",
        status: 500,
      },
    },
    async () => {
      const { userId } = await requireAuth();
      const body = await parseBody(request, AccountUpdateSchema, {
        code: "ACCOUNT_VALIDATION",
      });
      const name = String(body.name ?? "").trim();
      const email = String(body.email ?? "")
        .toLowerCase()
        .trim();
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
      await logAudit({
        actorId: userId,
        action: "ACCOUNT_UPDATE",
        targetUserId: userId,
        metadata: {
          nameChanged: !!name,
          emailChanged: !!email,
          imageChanged: !!image,
        },
      });
      return ok({ user: updated });
    },
  );
}
