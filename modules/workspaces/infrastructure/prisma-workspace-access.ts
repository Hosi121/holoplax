import prisma from "../../../lib/prisma";
import type { WorkspaceAccessPort } from "../application/workspace-access";

export const prismaWorkspaceAccessPort: WorkspaceAccessPort = {
  async isMember(userId, workspaceId) {
    const membership = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { userId: true },
    });
    return Boolean(membership);
  },
};
