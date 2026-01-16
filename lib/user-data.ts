import prisma from "./prisma";

export async function adoptOrphanTasks(userId: string, workspaceId: string) {
  await prisma.task.updateMany({
    where: { userId: null },
    data: { userId, workspaceId },
  });
  await prisma.task.updateMany({
    where: { userId, workspaceId: null },
    data: { workspaceId },
  });
}

export async function adoptOrphanVelocity(userId: string, workspaceId: string) {
  await prisma.velocityEntry.updateMany({
    where: { userId: null },
    data: { userId, workspaceId },
  });
  await prisma.velocityEntry.updateMany({
    where: { userId, workspaceId: null },
    data: { workspaceId },
  });
}

export async function adoptOrphanAiSuggestions(userId: string, workspaceId: string) {
  await prisma.aiSuggestion.updateMany({
    where: { userId: null },
    data: { userId, workspaceId },
  });
  await prisma.aiSuggestion.updateMany({
    where: { userId, workspaceId: null },
    data: { workspaceId },
  });
}
