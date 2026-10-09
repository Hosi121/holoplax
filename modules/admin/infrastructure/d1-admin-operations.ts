import bcrypt from "bcryptjs";
import type { UserRole } from "../../../database/models";
import db from "../../../lib/db";
import { encrypt, isEncrypted } from "../../../lib/encryption";
import { runtimeEnv } from "../../../server/runtime";
import { ApplicationError } from "../../shared/application/application-error";
import { runAtomicCommand } from "../../shared/infrastructure/d1-atomic-command";
import { deriveLegacyStatus } from "../../tasks";
import type { AdminOperationsPort } from "../application/admin-operations";
import { getAdminAudit } from "./d1-admin-audit";

const badRequest = (message: string) =>
  new ApplicationError("ADMIN_BAD_REQUEST", message, "bad_request");
const conflict = (message: string) => new ApplicationError("ADMIN_CONFLICT", message, "conflict");
const notFound = (message: string) => new ApplicationError("ADMIN_NOT_FOUND", message, "not_found");
const roles = new Set(["ADMIN", "USER"]);

export const d1AdminOperationsPort: AdminOperationsPort = {
  async getAiSetting() {
    const setting = await db.aiProviderSetting.findUnique({
      where: { id: 1 },
      select: { model: true, baseUrl: true, enabled: true, apiKey: true },
    });
    if (setting) {
      return {
        model: setting.model,
        baseUrl: setting.baseUrl ?? "",
        enabled: setting.enabled,
        hasApiKey: Boolean(setting.apiKey),
        source: "db",
      };
    }
    return {
      model:
        runtimeEnv.AI_MODEL ?? runtimeEnv.LITELLM_MODEL ?? runtimeEnv.OPENAI_MODEL ?? "gpt-4o-mini",
      baseUrl:
        runtimeEnv.AI_BASE_URL ?? runtimeEnv.LITELLM_BASE_URL ?? runtimeEnv.OPENAI_BASE_URL ?? "",
      enabled: false,
      hasApiKey: Boolean(
        runtimeEnv.AI_API_KEY ?? runtimeEnv.LITELLM_API_KEY ?? runtimeEnv.OPENAI_API_KEY,
      ),
      source: "env",
    };
  },

  updateAiSetting(actorId, input) {
    const model =
      input.model?.trim() ||
      runtimeEnv.AI_MODEL ||
      runtimeEnv.LITELLM_MODEL ||
      runtimeEnv.OPENAI_MODEL ||
      "gpt-4o-mini";
    return db.command(async (tx) => {
      const existing = await tx.aiProviderSetting.findUnique({
        where: { id: 1 },
        select: { apiKey: true },
      });
      const rawApiKey = input.apiKey?.trim();
      const apiKey = rawApiKey
        ? await encrypt(rawApiKey)
        : existing?.apiKey
          ? isEncrypted(existing.apiKey)
            ? existing.apiKey
            : await encrypt(existing.apiKey)
          : null;
      if (!apiKey) throw badRequest("apiKey is required");
      const setting = await tx.aiProviderSetting.upsert({
        where: { id: 1 },
        update: {
          model,
          baseUrl: input.baseUrl?.trim() || null,
          enabled: Boolean(input.enabled),
          apiKey,
        },
        create: {
          id: 1,
          model,
          baseUrl: input.baseUrl?.trim() || null,
          enabled: Boolean(input.enabled),
          apiKey,
        },
        select: { model: true, baseUrl: true, enabled: true },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: "AI_PROVIDER_UPDATE",
          metadata: {
            model: setting.model,
            enabled: setting.enabled,
            baseUrl: setting.baseUrl,
          },
        },
      });
      return { ...setting, hasApiKey: true, source: "db" };
    });
  },

  getAudit: getAdminAudit,

  runMaintenance(actorId) {
    return db.command(async (tx) => {
      const now = new Date();
      const emailTokens = await tx.emailVerificationToken.deleteMany({
        where: { expiresAt: { lt: now } },
      });
      const resetTokens = await tx.passwordResetToken.deleteMany({
        where: { OR: [{ expiresAt: { lt: now } }, { used: true }] },
      });
      const invites = await tx.workspaceInvite.deleteMany({ where: { expiresAt: { lt: now } } });
      const mcpKeys = await tx.mcpApiKey.deleteMany({
        where: { OR: [{ revokedAt: { lt: now } }, { expiresAt: { lt: now } }] },
      });
      const automationJobs = await tx.taskAutomationJob.deleteMany({
        where: {
          status: { in: ["SUCCEEDED", "CANCELED"] },
          updatedAt: { lt: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000) },
        },
      });
      const deleted = {
        emailVerificationTokens: emailTokens.count,
        passwordResetTokens: resetTokens.count,
        workspaceInvites: invites.count,
        mcpApiKeys: mcpKeys.count,
        taskAutomationJobs: automationJobs.count,
      };
      await tx.auditLog.create({
        data: { actorId, action: "ADMIN_MAINTENANCE_RUN", metadata: deleted },
      });
      return deleted;
    });
  },

  async listUsers(input) {
    const users = await db.user.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        disabledAt: true,
        createdAt: true,
        memberships: {
          select: { role: true, workspace: { select: { id: true, name: true } } },
        },
      },
    });
    const hasMore = users.length > input.limit;
    const page = hasMore ? users.slice(0, input.limit) : users;
    return { users: page, nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null };
  },

  async createUser(actorId, input) {
    const role = (input.role?.toUpperCase() || "USER") as UserRole;
    if (!roles.has(role)) throw badRequest("invalid role");
    const passwordHash = await bcrypt.hash(input.password, 10);
    return db.command(async (tx) => {
      const existing = await tx.user.findUnique({
        where: { email: input.email },
        select: { id: true },
      });
      if (existing) throw conflict("email already registered");
      const created = await tx.user.create({
        data: {
          email: input.email,
          name: input.name?.trim() || null,
          role,
          emailVerified: new Date(),
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          disabledAt: true,
          createdAt: true,
        },
      });
      await tx.userPassword.create({ data: { userId: created.id, hash: passwordHash } });
      await tx.auditLog.create({
        data: {
          actorId,
          action: "ADMIN_USER_CREATE",
          targetUserId: created.id,
          metadata: { role: created.role },
        },
      });
      return created;
    });
  },

  updateUser(actorId, targetUserId, input) {
    const role = input.role?.toUpperCase();
    if (role && !roles.has(role)) throw badRequest("invalid role");
    return runAtomicCommand(
      async (tx) => {
        const target = await tx.user.findUnique({
          where: { id: targetUserId },
          select: { role: true, disabledAt: true },
        });
        if (!target) throw notFound("user not found");
        const willBeAdmin = (role ?? target.role) === "ADMIN";
        const willBeDisabled =
          typeof input.disabled === "boolean" ? input.disabled : target.disabledAt !== null;
        if (target.role === "ADMIN" && !target.disabledAt && (!willBeAdmin || willBeDisabled)) {
          const otherActiveAdmins = await tx.user.count({
            where: { role: "ADMIN", disabledAt: null, id: { not: targetUserId } },
          });
          if (!otherActiveAdmins) throw conflict("cannot demote or disable the last active admin");
        }
        if (input.disabled) {
          const ownedWorkspaceCount = await tx.workspace.count({
            where: { ownerId: targetUserId },
          });
          if (ownedWorkspaceCount) {
            throw conflict("transfer owned workspaces before disabling this user");
          }
        }
        const updated = await tx.user.update({
          where: { id: targetUserId },
          data: {
            role: (role as UserRole) ?? undefined,
            disabledAt:
              typeof input.disabled === "boolean"
                ? input.disabled
                  ? new Date()
                  : null
                : undefined,
          },
          select: { id: true, name: true, email: true, role: true, disabledAt: true },
        });
        await tx.auditLog.create({
          data: {
            actorId,
            action: "ADMIN_USER_UPDATE",
            targetUserId,
            metadata: { role: updated.role, disabled: Boolean(updated.disabledAt) },
          },
        });
        return updated;
      },
      {
        code: "ADMIN_CONCURRENT_UPDATE",
        message: "user administration changed concurrently; retry the operation",
      },
    );
  },

  async listUserTasks(userId) {
    const tasks = await db.task.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: 500,
      select: {
        id: true,
        title: true,
        workflowState: true,
        sprint: { select: { status: true } },
        points: true,
        updatedAt: true,
        workspace: { select: { name: true } },
      },
    });
    return tasks.map(({ workspace, sprint, workflowState, ...task }) => ({
      ...task,
      status: deriveLegacyStatus({
        workflowState,
        isInActiveSprint: sprint?.status === "ACTIVE",
      }),
      workspaceName: workspace?.name ?? null,
    }));
  },
};
