import { getRequestCookie } from "../server/request-context";
import db from "./db";

export async function resolveWorkspaceId(userId: string) {
  const preferred = getRequestCookie("workspaceId");

  if (preferred) {
    const membership = await db.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: preferred, userId } },
      select: { workspaceId: true },
    });
    if (membership) {
      return preferred;
    }
  }

  const fallback = await db.workspaceMember.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { workspaceId: true },
  });
  if (fallback?.workspaceId) {
    return fallback.workspaceId;
  }

  // 初回ユーザー用に個人ワークスペースを自動作成する
  const createdId = await db.command(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) return null;

    const existing = await tx.workspaceMember.findFirst({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: { workspaceId: true },
    });
    if (existing?.workspaceId) return existing.workspaceId;

    const workspace = await tx.workspace.create({
      data: {
        name: "Personal workspace",
        ownerId: userId,
      },
      select: { id: true },
    });
    await tx.workspaceMember.create({ data: { workspaceId: workspace.id, userId, role: "owner" } });
    return workspace.id;
  });

  return createdId ?? null;
}
