import { randomBytes } from "crypto";
import { getBaseUrl } from "../../../lib/base-url";
import { escapeHtml } from "../../../lib/html-escape";
import { logger } from "../../../lib/logger";
import { sendEmail } from "../../../lib/mailer";
import prisma from "../../../lib/prisma";
import { ApplicationError } from "../../shared/application/application-error";
import type { WorkspaceCommandPort } from "../application/workspace-commands";

const badRequest = (message: string) =>
  new ApplicationError("WORKSPACE_BAD_REQUEST", message, "bad_request");
const notFound = (message: string) =>
  new ApplicationError("WORKSPACE_NOT_FOUND", message, "not_found");

export const prismaWorkspaceCommandPort: WorkspaceCommandPort = {
  async list(userId) {
    const memberships = await prisma.workspaceMember.findMany({
      where: { userId },
      select: {
        role: true,
        workspace: { select: { id: true, name: true, ownerId: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return memberships.map(({ role, workspace }) => ({ ...workspace, role }));
  },

  create(userId, name) {
    return prisma.$transaction(async (tx) => {
      const workspace = await tx.workspace.create({
        data: {
          name,
          ownerId: userId,
          members: { create: { userId, role: "owner" } },
        },
        select: { id: true, name: true, ownerId: true, createdAt: true },
      });
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: "WORKSPACE_CREATE",
          targetWorkspaceId: workspace.id,
          metadata: { name },
        },
      });
      return workspace;
    });
  },

  async listMembers(workspaceId) {
    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "asc" },
      take: 500,
    });
    return members.map(({ user, role }) => ({ ...user, role }));
  },

  addMember(input) {
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { email: input.email },
        select: { id: true },
      });
      if (!user) throw badRequest("user not found");
      const member = await tx.workspaceMember.upsert({
        where: {
          workspaceId_userId: { workspaceId: input.workspaceId, userId: user.id },
        },
        update: { role: input.role },
        create: { workspaceId: input.workspaceId, userId: user.id, role: input.role },
        select: { userId: true, workspaceId: true, role: true, createdAt: true },
      });
      await tx.auditLog.create({
        data: {
          actorId: input.actorId,
          action: "WORKSPACE_MEMBER_ADD",
          targetWorkspaceId: input.workspaceId,
          targetUserId: user.id,
          metadata: { role: member.role },
        },
      });
      return member;
    });
  },

  async createInvite(input) {
    const { workspace, invite } = await prisma.$transaction(async (tx) => {
      const workspace = await tx.workspace.findUnique({
        where: { id: input.workspaceId },
        select: { name: true },
      });
      if (!workspace) throw notFound("workspace not found");
      const invite = await tx.workspaceInvite.create({
        data: {
          workspaceId: input.workspaceId,
          email: input.email,
          role: input.role,
          token: randomBytes(24).toString("hex"),
          expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: input.actorId,
          action: "WORKSPACE_INVITE_CREATE",
          targetWorkspaceId: input.workspaceId,
          metadata: { email: input.email, role: input.role },
        },
      });
      return { workspace, invite };
    });

    const inviteUrl = `${getBaseUrl()}/workspaces/invite?token=${invite.token}`;
    const workspaceName = escapeHtml(workspace.name);
    const safeRole = escapeHtml(input.role);
    try {
      await sendEmail({
        to: input.email,
        subject: `Holoplax: ${workspaceName} へ招待されました`,
        html: [
          `<p>あなたは <strong>${workspaceName}</strong> に <strong>${safeRole}</strong> として招待されました。</p>`,
          `<p>以下のリンクから参加できます（有効期限：7日間）：</p>`,
          `<p><a href="${inviteUrl}">${inviteUrl}</a></p>`,
        ].join("\n"),
      });
    } catch (error) {
      logger.error(
        "WORKSPACE_INVITE email failed",
        { workspaceId: input.workspaceId, inviteId: invite.id },
        error,
      );
    }
    return { inviteUrl, invite };
  },

  acceptInvite(userId, token) {
    return prisma.$transaction(
      async (tx) => {
        const [user, invite] = await Promise.all([
          tx.user.findUnique({ where: { id: userId }, select: { email: true } }),
          tx.workspaceInvite.findUnique({ where: { token } }),
        ]);
        if (
          !invite ||
          invite.expiresAt < new Date() ||
          invite.acceptedAt !== null ||
          invite.role === "owner"
        ) {
          throw badRequest("invite is invalid or expired");
        }
        if (!user?.email || user.email.toLowerCase() !== invite.email.toLowerCase()) {
          throw badRequest("invite email mismatch");
        }

        const claimed = await tx.workspaceInvite.updateMany({
          where: { id: invite.id, acceptedAt: null, expiresAt: { gte: new Date() } },
          data: { acceptedAt: new Date() },
        });
        if (claimed.count !== 1) throw badRequest("invite is invalid or expired");
        await tx.workspaceMember.upsert({
          where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId } },
          update: { role: invite.role },
          create: { workspaceId: invite.workspaceId, userId, role: invite.role },
        });
        await tx.user.updateMany({
          where: { id: userId, onboardingCompletedAt: null },
          data: { onboardingCompletedAt: new Date() },
        });
        await tx.auditLog.create({
          data: {
            actorId: userId,
            action: "WORKSPACE_INVITE_ACCEPT",
            targetWorkspaceId: invite.workspaceId,
            metadata: { email: invite.email, role: invite.role },
          },
        });
        return { workspaceId: invite.workspaceId };
      },
      { isolationLevel: "Serializable" },
    );
  },
};
