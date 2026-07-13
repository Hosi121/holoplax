import { Prisma } from "@prisma/client";
import { compare, hash } from "bcryptjs";
import { randomBytes } from "crypto";
import { getBaseUrl } from "../../../lib/base-url";
import { logger } from "../../../lib/logger";
import { sendEmail } from "../../../lib/mailer";
import prisma from "../../../lib/prisma";
import { ApplicationError } from "../../shared/application/application-error";
import type { IdentityPort } from "../application/identity-commands";

const badRequest = (message: string) =>
  new ApplicationError("AUTH_BAD_REQUEST", message, "bad_request");
const accountBadRequest = (message: string) =>
  new ApplicationError("ACCOUNT_BAD_REQUEST", message, "bad_request");
const conflict = (message: string) => new ApplicationError("ACCOUNT_CONFLICT", message, "conflict");

const shouldVerifyEmail = () => {
  const baseUrl = getBaseUrl();
  const isLocal = baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1");
  const forceVerify = process.env.EMAIL_VERIFY_ALWAYS === "true";
  const hasEmailConfig = Boolean(process.env.EMAIL_SERVER && process.env.EMAIL_FROM);
  if (!isLocal && !hasEmailConfig && !forceVerify) {
    throw new Error("registration is temporarily unavailable: email is not configured");
  }
  return forceVerify || (!isLocal && hasEmailConfig);
};

const isSafeCallbackUrl = (value?: string) =>
  Boolean(value?.startsWith("/") && !value.startsWith("//"));

const sendVerificationLink = async (email: string, token: string, callbackUrl?: string) => {
  const verifyUrl = new URL("/auth/verify", getBaseUrl());
  verifyUrl.searchParams.set("token", token);
  if (isSafeCallbackUrl(callbackUrl)) verifyUrl.searchParams.set("callbackUrl", callbackUrl ?? "");
  const url = verifyUrl.toString();
  await sendEmail({
    to: email,
    subject: "Holoplax メール認証",
    html: `<p>以下のリンクからメール認証を完了してください。</p><p><a href="${url}">${url}</a></p>`,
  });
};

const issueVerification = async (userId: string, email: string, callbackUrl?: string) => {
  const token = await prisma.$transaction(async (tx) => {
    const current = await tx.user.findUnique({
      where: { id: userId },
      select: { email: true, emailVerified: true, disabledAt: true },
    });
    if (
      !current?.email ||
      current.email.toLowerCase() !== email.toLowerCase() ||
      current.emailVerified ||
      current.disabledAt
    ) {
      return null;
    }
    const nextToken = randomBytes(32).toString("hex");
    await tx.emailVerificationToken.deleteMany({ where: { userId } });
    await tx.emailVerificationToken.create({
      data: { userId, token: nextToken, expiresAt: new Date(Date.now() + 60 * 60 * 1000) },
    });
    return nextToken;
  });
  if (!token) return false;
  await sendVerificationLink(email, token, callbackUrl);
  return true;
};

export const prismaIdentityPort: IdentityPort = {
  async getAccount(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        accounts: { select: { provider: true, providerAccountId: true } },
      },
    });
    return { user, linkedProviders: user?.accounts.map(({ provider }) => provider) ?? [] };
  },

  async updateAccount(userId, input) {
    const nameProvided = input.name !== undefined;
    const emailProvided = input.email !== undefined;
    const imageProvided = input.image !== undefined;
    const name = input.name?.trim() ?? "";
    const email = input.email?.toLowerCase().trim() ?? "";
    const image = input.image?.trim() ?? "";
    const baseUrl = getBaseUrl();
    const current = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    const emailChanged = emailProvided && email !== (current?.email ?? "").toLowerCase();
    const isLocal = baseUrl.includes("localhost") || baseUrl.includes("127.0.0.1");
    const shouldReverify =
      emailChanged &&
      Boolean(email) &&
      (process.env.EMAIL_VERIFY_ALWAYS === "true" ||
        (!isLocal && Boolean(process.env.EMAIL_SERVER && process.env.EMAIL_FROM)));

    const { user: updated, verificationToken } = await prisma
      .$transaction(async (tx) => {
        if (email) {
          const existing = await tx.user.findFirst({
            where: { email, NOT: { id: userId } },
            select: { id: true },
          });
          if (existing) throw conflict("email already in use");
        }
        const user = await tx.user.update({
          where: { id: userId },
          data: {
            ...(nameProvided ? { name: name || null } : {}),
            ...(emailProvided ? { email: email || null } : {}),
            ...(imageProvided ? { image: image || null } : {}),
            ...(emailChanged ? { emailVerified: shouldReverify ? null : new Date() } : {}),
          },
          select: { id: true, name: true, email: true, image: true },
        });
        await tx.auditLog.create({
          data: {
            actorId: userId,
            action: "ACCOUNT_UPDATE",
            targetUserId: userId,
            metadata: {
              nameChanged: nameProvided,
              emailChanged,
              imageChanged: imageProvided,
              reverificationSent: shouldReverify,
            },
          },
        });
        let verificationToken: string | null = null;
        if (shouldReverify && user.email) {
          verificationToken = randomBytes(32).toString("hex");
          await tx.emailVerificationToken.deleteMany({ where: { userId } });
          await tx.emailVerificationToken.create({
            data: {
              userId,
              token: verificationToken,
              expiresAt: new Date(Date.now() + 60 * 60 * 1000),
            },
          });
        }
        return { user, verificationToken };
      })
      .catch((error: unknown) => {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          throw conflict("email already in use");
        }
        throw error;
      });

    if (verificationToken && updated.email) {
      try {
        await sendVerificationLink(updated.email, verificationToken);
      } catch (error) {
        logger.error("Email change verification send failed", { userId }, error);
      }
    }
    return { user: updated };
  },

  async changePassword(userId, currentPassword, newPassword) {
    const stored = await prisma.userPassword.findUnique({
      where: { userId },
      select: { hash: true },
    });
    if (!stored) {
      throw accountBadRequest(
        "this account has no password — sign in with your OAuth provider instead",
      );
    }
    if (!(await compare(currentPassword, stored.hash))) {
      throw accountBadRequest("current password is incorrect");
    }
    const newHash = await hash(newPassword, 12);
    await prisma.$transaction(async (tx) => {
      await tx.userPassword.update({ where: { userId }, data: { hash: newHash } });
      await tx.user.update({ where: { id: userId }, data: { passwordChangedAt: new Date() } });
      await tx.auditLog.create({
        data: { actorId: userId, action: "ACCOUNT_PASSWORD_CHANGE", targetUserId: userId },
      });
    });
  },

  async unlinkProvider(userId, provider) {
    await prisma.$transaction(async (tx) => {
      const [accounts, password] = await Promise.all([
        tx.account.findMany({ where: { userId }, select: { provider: true } }),
        tx.userPassword.findUnique({ where: { userId }, select: { id: true } }),
      ]);
      if (accounts.length <= 1 && !password) {
        throw accountBadRequest("少なくとも1つの認証方法が必要です");
      }
      const removed = await tx.account.deleteMany({ where: { userId, provider } });
      if (!removed.count) throw accountBadRequest("provider is not linked");
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: "ACCOUNT_PROVIDER_UNLINK",
          targetUserId: userId,
          metadata: { provider },
        },
      });
    });
  },

  async register(input) {
    const passwordHash = await hash(input.password, 10);
    const requiresEmailVerification = shouldVerifyEmail();
    let user: { id: string; email: string | null };
    try {
      user = await prisma.$transaction(async (tx) => {
        const existing = await tx.user.findUnique({
          where: { email: input.email },
          select: { id: true },
        });
        if (existing) {
          throw new ApplicationError("AUTH_CONFLICT", "email already registered", "conflict");
        }
        const created = await tx.user.create({
          data: {
            email: input.email,
            name: input.name?.trim() || null,
            emailVerified: requiresEmailVerification ? null : new Date(),
            password: { create: { hash: passwordHash } },
          },
          select: { id: true, email: true },
        });
        await tx.auditLog.create({
          data: {
            actorId: created.id,
            action: "AUTH_REGISTER",
            metadata: { requiresEmailVerification },
          },
        });
        return created;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ApplicationError("AUTH_CONFLICT", "email already registered", "conflict");
      }
      throw error;
    }

    let verificationEmailSent = false;
    if (requiresEmailVerification) {
      try {
        verificationEmailSent = await issueVerification(
          user.id,
          user.email ?? input.email,
          input.callbackUrl,
        );
      } catch (error) {
        logger.error("Email verification send failed", { userId: user.id }, error);
      }
    }
    return {
      ...user,
      requiresEmailVerification,
      verificationEmailSent,
    };
  },

  async requestPasswordReset(email) {
    const startedAt = Date.now();
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, disabledAt: true },
    });
    if (user && !user.disabledAt) {
      const token = randomBytes(32).toString("hex");
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
      await prisma.$transaction(async (tx) => {
        await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });
        await tx.passwordResetToken.create({
          data: { userId: user.id, token, expiresAt },
        });
        await tx.auditLog.create({
          data: {
            actorId: user.id,
            action: "AUTH_RESET_REQUESTED",
            metadata: { expiresAt: expiresAt.toISOString() },
          },
        });
      });
      try {
        const resetUrl = `${getBaseUrl()}/auth/reset?token=${token}`;
        await sendEmail({
          to: user.email ?? email,
          subject: "Holoplax パスワード再設定",
          html: `<p>以下のリンクからパスワードを再設定してください。</p><p><a href="${resetUrl}">${resetUrl}</a></p>`,
        });
      } catch (error) {
        logger.error("Password reset email failed", { userId: user.id }, error);
      }
    }
    const remainingDelay = 500 - (Date.now() - startedAt);
    if (remainingDelay > 0) await new Promise((resolve) => setTimeout(resolve, remainingDelay));
  },

  async resendVerification(email, callbackUrl) {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, emailVerified: true, disabledAt: true },
    });
    if (user?.email && !user.emailVerified && !user.disabledAt) {
      try {
        await issueVerification(user.id, user.email, callbackUrl);
      } catch (error) {
        logger.error("Email verification resend failed", { userId: user.id }, error);
      }
    }
  },

  async resetPassword(token, password) {
    const passwordHash = await hash(password, 10);
    const userId = await prisma.$transaction(
      async (tx) => {
        const record = await tx.passwordResetToken.findUnique({ where: { token } });
        if (!record || record.used || record.expiresAt < new Date()) return null;
        const claimed = await tx.passwordResetToken.deleteMany({
          where: { id: record.id, used: false, expiresAt: { gte: new Date() } },
        });
        if (claimed.count !== 1) return null;
        await tx.userPassword.upsert({
          where: { userId: record.userId },
          update: { hash: passwordHash },
          create: { userId: record.userId, hash: passwordHash },
        });
        await tx.user.update({
          where: { id: record.userId },
          data: { passwordChangedAt: new Date() },
        });
        await tx.auditLog.create({
          data: {
            actorId: record.userId,
            action: "AUTH_PASSWORD_RESET",
            metadata: { via: "reset_token" },
          },
        });
        return record.userId;
      },
      { isolationLevel: "Serializable" },
    );
    if (!userId) throw badRequest("token is invalid or expired");
  },

  async verifyEmail(token) {
    const userId = await prisma.$transaction(
      async (tx) => {
        const record = await tx.emailVerificationToken.findUnique({ where: { token } });
        if (!record || record.expiresAt < new Date()) return null;
        const claimed = await tx.emailVerificationToken.deleteMany({
          where: { id: record.id, expiresAt: { gte: new Date() } },
        });
        if (claimed.count !== 1) return null;
        await tx.user.update({
          where: { id: record.userId },
          data: { emailVerified: new Date() },
        });
        await tx.auditLog.create({
          data: {
            actorId: record.userId,
            action: "AUTH_EMAIL_VERIFIED",
            metadata: { via: "verification_token" },
          },
        });
        return record.userId;
      },
      { isolationLevel: "Serializable" },
    );
    if (!userId) throw badRequest("token is invalid or expired");
  },
};
