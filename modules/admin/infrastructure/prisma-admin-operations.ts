import type { UserRole } from "@prisma/client";
import { hash } from "bcryptjs";
import { encrypt, isEncrypted } from "../../../lib/encryption";
import prisma from "../../../lib/prisma";
import { ApplicationError } from "../../shared/application/application-error";
import type { AdminOperationsPort } from "../application/admin-operations";
import { getAdminAudit } from "./prisma-admin-audit";

const badRequest = (message: string) =>
  new ApplicationError("ADMIN_BAD_REQUEST", message, "bad_request");
const conflict = (message: string) => new ApplicationError("ADMIN_CONFLICT", message, "conflict");
const notFound = (message: string) => new ApplicationError("ADMIN_NOT_FOUND", message, "not_found");
const roles = new Set(["ADMIN", "USER"]);

export const prismaAdminOperationsPort: AdminOperationsPort = {
  async getAiSetting() {
    const setting = await prisma.aiProviderSetting.findUnique({
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
        process.env.AI_MODEL ??
        process.env.LITELLM_MODEL ??
        process.env.OPENAI_MODEL ??
        "gpt-4o-mini",
      baseUrl:
        process.env.AI_BASE_URL ??
        process.env.LITELLM_BASE_URL ??
        process.env.OPENAI_BASE_URL ??
        "",
      enabled: false,
      hasApiKey: Boolean(
        process.env.AI_API_KEY ?? process.env.LITELLM_API_KEY ?? process.env.OPENAI_API_KEY,
      ),
      source: "env",
    };
  },

  updateAiSetting(actorId, input) {
    const model =
      input.model?.trim() ||
      process.env.AI_MODEL ||
      process.env.LITELLM_MODEL ||
      process.env.OPENAI_MODEL ||
      "gpt-4o-mini";
    return prisma.$transaction(async (tx) => {
      const existing = await tx.aiProviderSetting.findUnique({
        where: { id: 1 },
        select: { apiKey: true },
      });
      const rawApiKey = input.apiKey?.trim();
      const apiKey = rawApiKey
        ? encrypt(rawApiKey)
        : existing?.apiKey
          ? isEncrypted(existing.apiKey)
            ? existing.apiKey
            : encrypt(existing.apiKey)
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
    return prisma.$transaction(async (tx) => {
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
    const users = await prisma.user.findMany({
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
    const passwordHash = await hash(input.password, 10);
    return prisma.$transaction(async (tx) => {
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
          password: { create: { hash: passwordHash } },
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
    return prisma.$transaction(
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
      { isolationLevel: "Serializable" },
    );
  },

  async listUserTasks(userId) {
    const tasks = await prisma.task.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: 500,
      select: {
        id: true,
        title: true,
        status: true,
        points: true,
        updatedAt: true,
        workspace: { select: { name: true } },
      },
    });
    return tasks.map(({ workspace, ...task }) => ({
      ...task,
      workspaceName: workspace?.name ?? null,
    }));
  },
};
