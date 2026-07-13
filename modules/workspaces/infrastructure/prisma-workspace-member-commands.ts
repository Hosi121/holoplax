import prisma from "../../../lib/prisma";
import { ApplicationError } from "../../shared/application/application-error";
import type { WorkspaceMemberCommandPort } from "../application/member-commands";
import type { WorkspaceRole } from "../domain/workspace-types";

type MemberParams = {
  actorId: string;
  workspaceId: string;
  targetUserId: string;
};

const notFound = (message: string) =>
  new ApplicationError("WORKSPACE_NOT_FOUND", message, "not_found");
const forbidden = (message: string) =>
  new ApplicationError("WORKSPACE_FORBIDDEN", message, "forbidden");
const conflict = (message: string) =>
  new ApplicationError("WORKSPACE_CONFLICT", message, "conflict");

export async function updateWorkspaceMemberRole(params: MemberParams & { role: WorkspaceRole }) {
  const { actorId, workspaceId, targetUserId, role } = params;

  const result = await prisma.$transaction(
    async (tx) => {
      const [target, workspace] = await Promise.all([
        tx.workspaceMember.findUnique({
          where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
          select: { role: true },
        }),
        tx.workspace.findUnique({ where: { id: workspaceId }, select: { ownerId: true } }),
      ]);
      if (!target) throw notFound("member not found");
      if (!workspace) throw notFound("workspace not found");

      if (role === "owner") {
        if (workspace.ownerId !== actorId) {
          throw forbidden("only the current workspace owner can transfer ownership");
        }

        const ownershipClaim = await tx.workspace.updateMany({
          where: { id: workspaceId, ownerId: actorId },
          data: { ownerId: targetUserId },
        });
        if (ownershipClaim.count !== 1) {
          throw conflict("workspace ownership changed; retry the operation");
        }

        await tx.workspaceMember.updateMany({
          where: { workspaceId, role: "owner", userId: { not: targetUserId } },
          data: { role: "admin" },
        });
        const member = await tx.workspaceMember.update({
          where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
          data: { role: "owner" },
          select: { userId: true, workspaceId: true, role: true },
        });
        await tx.auditLog.create({
          data: {
            actorId,
            action: "WORKSPACE_OWNERSHIP_TRANSFER",
            targetWorkspaceId: workspaceId,
            targetUserId,
            metadata: { previousOwnerId: workspace.ownerId },
          },
        });
        return member;
      }

      if (workspace.ownerId === targetUserId) {
        throw conflict("transfer ownership before changing the owner's role");
      }
      if (target.role === "owner" && workspace.ownerId !== actorId) {
        throw forbidden("only the current workspace owner can change an owner role");
      }

      const member = await tx.workspaceMember.update({
        where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
        data: { role },
        select: { userId: true, workspaceId: true, role: true },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: "WORKSPACE_MEMBER_ROLE_UPDATE",
          targetWorkspaceId: workspaceId,
          targetUserId,
          metadata: { role },
        },
      });
      return member;
    },
    { isolationLevel: "Serializable" },
  );

  return result;
}

export async function removeWorkspaceMember(params: MemberParams) {
  const { actorId, workspaceId, targetUserId } = params;

  await prisma.$transaction(
    async (tx) => {
      const [target, workspace] = await Promise.all([
        tx.workspaceMember.findUnique({
          where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
          select: { role: true },
        }),
        tx.workspace.findUnique({ where: { id: workspaceId }, select: { ownerId: true } }),
      ]);
      if (!target) throw notFound("member not found");
      if (!workspace) throw notFound("workspace not found");
      if (workspace.ownerId === targetUserId) {
        throw conflict("transfer ownership before removing the owner");
      }

      // Assignment is workspace membership, not merely a reference to a User.
      // Clear it in the same transaction so a removed member cannot remain an
      // assignee in a workspace they can no longer access.
      await tx.task.updateMany({
        where: { workspaceId, assigneeId: targetUserId },
        data: { assigneeId: null },
      });
      await tx.workspaceMember.delete({
        where: { workspaceId_userId: { workspaceId, userId: targetUserId } },
      });
      await tx.auditLog.create({
        data: {
          actorId,
          action: "WORKSPACE_MEMBER_REMOVE",
          targetWorkspaceId: workspaceId,
          targetUserId,
        },
      });
    },
    { isolationLevel: "Serializable" },
  );
}

export const prismaWorkspaceMemberCommandPort: WorkspaceMemberCommandPort = {
  updateRole: (actor, role) => updateWorkspaceMemberRole({ ...actor, role }),
  remove: removeWorkspaceMember,
};
