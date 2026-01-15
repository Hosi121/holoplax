import prisma from "./prisma";

export async function adoptOrphanTasks(userId: string) {
  await prisma.task.updateMany({
    where: { userId: null },
    data: { userId },
  });
}

export async function adoptOrphanVelocity(userId: string) {
  await prisma.velocityEntry.updateMany({
    where: { userId: null },
    data: { userId },
  });
}

export async function adoptOrphanAiSuggestions(userId: string) {
  await prisma.aiSuggestion.updateMany({
    where: { userId: null },
    data: { userId },
  });
}
