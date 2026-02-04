-- CreateTable
CREATE TABLE "McpApiKey" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "McpApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "McpApiKey_keyHash_key" ON "McpApiKey"("keyHash");

-- CreateIndex
CREATE INDEX "McpApiKey_userId_idx" ON "McpApiKey"("userId");

-- CreateIndex
CREATE INDEX "McpApiKey_workspaceId_idx" ON "McpApiKey"("workspaceId");

-- AddForeignKey
ALTER TABLE "McpApiKey" ADD CONSTRAINT "McpApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "McpApiKey" ADD CONSTRAINT "McpApiKey_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
