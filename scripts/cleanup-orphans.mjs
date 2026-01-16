import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const main = async () => {
  const deletedTasks = await prisma.task.deleteMany({
    where: { OR: [{ workspaceId: null }, { userId: null }] },
  });
  const deletedVelocity = await prisma.velocityEntry.deleteMany({
    where: { OR: [{ workspaceId: null }, { userId: null }] },
  });
  const deletedAiSuggestions = await prisma.aiSuggestion.deleteMany({
    where: { OR: [{ workspaceId: null }, { userId: null }] },
  });
  const deletedAutomationSettings = await prisma.userAutomationSetting.deleteMany({
    where: { workspaceId: null },
  });

  console.log("Deleted orphan records:", {
    tasks: deletedTasks.count,
    velocityEntries: deletedVelocity.count,
    aiSuggestions: deletedAiSuggestions.count,
    userAutomationSettings: deletedAutomationSettings.count,
  });
};

main()
  .catch((error) => {
    console.error("Cleanup failed", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
