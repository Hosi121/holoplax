import db from "../../../lib/db";
import type { WorkspaceAccessPort } from "../application/workspace-access";

export const d1WorkspaceAccessPort: WorkspaceAccessPort = {
  async isMember(userId, workspaceId) {
    const membership = await db.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { userId: true },
    });
    return Boolean(membership);
  },
};
