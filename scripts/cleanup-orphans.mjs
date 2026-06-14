import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Safety guardrails: this script permanently deletes rows whose owner columns
// are null. It runs in DRY-RUN mode by default (counts only). Pass --confirm to
// actually delete. A sanity cap aborts if the number of matched rows looks
// unexpectedly large (likely a migration/data issue rather than a few orphans).
const CONFIRM = process.argv.includes("--confirm");
const MAX_DELETE = Number(process.env.CLEANUP_MAX_ROWS ?? "500");

const orphanFilter = { OR: [{ workspaceId: null }, { userId: null }] };

const main = async () => {
  const counts = {
    tasks: await prisma.task.count({ where: orphanFilter }),
    velocityEntries: await prisma.velocityEntry.count({ where: orphanFilter }),
    aiSuggestions: await prisma.aiSuggestion.count({ where: orphanFilter }),
    userAutomationSettings: await prisma.userAutomationSetting.count({
      where: { workspaceId: null },
    }),
  };
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);

  console.log("Orphan records matched:", counts, `(total ${total})`);

  if (!CONFIRM) {
    console.log("\nDRY RUN — no rows deleted. Re-run with --confirm to delete.");
    return;
  }

  if (total > MAX_DELETE) {
    console.error(
      `\nABORT: ${total} rows exceed the safety cap of ${MAX_DELETE}. ` +
        "Investigate the data first, or raise CLEANUP_MAX_ROWS deliberately.",
    );
    process.exit(1);
  }

  const deletedTasks = await prisma.task.deleteMany({ where: orphanFilter });
  const deletedVelocity = await prisma.velocityEntry.deleteMany({ where: orphanFilter });
  const deletedAiSuggestions = await prisma.aiSuggestion.deleteMany({ where: orphanFilter });
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
