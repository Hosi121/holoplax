-- DropIndex
DROP INDEX IF EXISTS "UserAutomationSetting_userId_key";

-- CreateIndex
CREATE UNIQUE INDEX "UserAutomationSetting_userId_workspaceId_key"
ON "UserAutomationSetting"("userId", "workspaceId");
