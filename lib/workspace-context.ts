import { cookies } from "next/headers";
import prisma from "./prisma";

export async function resolveWorkspaceId(userId: string) {
  const cookieStore = await cookies();
  const preferred = cookieStore.get("workspaceId")?.value ?? null;

  if (preferred) {
    const membership = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: preferred, userId } },
      select: { workspaceId: true },
    });
    if (membership) {
      return preferred;
    }
  }

  const fallback = await prisma.workspaceMember.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { workspaceId: true },
  });
  if (fallback?.workspaceId) {
    return fallback.workspaceId;
  }

  // 初回ユーザー用に個人ワークスペースを自動作成する
  const createdId = await prisma.$transaction(async (tx) => {
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
        members: { create: { userId, role: "owner" } },
      },
      select: { id: true },
    });
    return workspace.id;
  });

  return createdId ?? null;
}
