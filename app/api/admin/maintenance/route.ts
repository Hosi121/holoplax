import { requireAdmin } from "../../../../lib/api-guards";
import { withApiHandler } from "../../../../lib/api-handler";
import { ok } from "../../../../lib/api-response";
import { logAudit } from "../../../../lib/audit";
import prisma from "../../../../lib/prisma";

/**
 * POST /api/admin/maintenance
 *
 * Deletes expired authentication tokens and workspace invites that have
 * accumulated in the database.  This should be called by a scheduled job
 * (e.g. a cron trigger or external scheduler) to keep the tables lean.
 *
 * Secured to admin users only.  Safe to run multiple times (idempotent).
 */
export async function POST() {
  return withApiHandler(
    {
      logLabel: "POST /api/admin/maintenance",
      errorFallback: {
        code: "ADMIN_MAINTENANCE_INTERNAL",
        message: "maintenance job failed",
        status: 500,
      },
    },
    async () => {
      const { userId } = await requireAdmin("ADMIN");
      const now = new Date();

      const [emailTokens, resetTokens, invites, mcpKeys] = await Promise.all([
        // Expired email-verification tokens
        prisma.emailVerificationToken.deleteMany({
          where: { expiresAt: { lt: now } },
        }),
        // Expired OR used password-reset tokens
        prisma.passwordResetToken.deleteMany({
          where: { OR: [{ expiresAt: { lt: now } }, { used: true }] },
        }),
        // Expired workspace invites
        prisma.workspaceInvite.deleteMany({
          where: { expiresAt: { lt: now } },
        }),
        // Expired MCP API keys (already revoked or past their expiresAt)
        prisma.mcpApiKey.deleteMany({
          where: {
            OR: [{ revokedAt: { lt: now } }, { expiresAt: { lt: now } }],
          },
        }),
      ]);

      const deleted = {
        emailVerificationTokens: emailTokens.count,
        passwordResetTokens: resetTokens.count,
        workspaceInvites: invites.count,
        mcpApiKeys: mcpKeys.count,
      };

      await logAudit({
        actorId: userId,
        action: "ADMIN_MAINTENANCE_RUN",
        metadata: deleted,
      });

      return ok({ ok: true, deleted });
    },
  );
}
