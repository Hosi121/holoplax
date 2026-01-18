-- CreateEnum
CREATE TYPE "MemoryScope" AS ENUM ('USER', 'WORKSPACE');

-- CreateEnum
CREATE TYPE "MemoryValueType" AS ENUM ('STRING', 'NUMBER', 'BOOL', 'JSON', 'RATIO', 'DURATION_MS', 'HISTOGRAM_24x7', 'RATIO_BY_TYPE');

-- CreateEnum
CREATE TYPE "MemorySource" AS ENUM ('EXPLICIT', 'INFERRED');

-- CreateEnum
CREATE TYPE "MemoryStatus" AS ENUM ('ACTIVE', 'REJECTED', 'STALE');

-- CreateTable
CREATE TABLE "MemoryType" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "scope" "MemoryScope" NOT NULL,
    "valueType" "MemoryValueType" NOT NULL,
    "unit" TEXT,
    "granularity" TEXT NOT NULL,
    "updatePolicy" TEXT NOT NULL,
    "decayDays" INTEGER,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemoryType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemoryClaim" (
    "id" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "userId" TEXT,
    "workspaceId" TEXT,
    "valueStr" TEXT,
    "valueNum" DOUBLE PRECISION,
    "valueBool" BOOLEAN,
    "valueJson" JSONB,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "source" "MemorySource" NOT NULL DEFAULT 'INFERRED',
    "status" "MemoryStatus" NOT NULL DEFAULT 'ACTIVE',
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTo" TIMESTAMP(3),
    "evidence" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemoryClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemoryMetric" (
    "id" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "userId" TEXT,
    "workspaceId" TEXT,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "windowEnd" TIMESTAMP(3) NOT NULL,
    "valueNum" DOUBLE PRECISION,
    "valueJson" JSONB,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemoryMetric_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MemoryType_key_scope_key" ON "MemoryType"("key", "scope");

-- CreateIndex
CREATE INDEX "MemoryType_scope_idx" ON "MemoryType"("scope");

-- CreateIndex
CREATE INDEX "MemoryClaim_typeId_userId_idx" ON "MemoryClaim"("typeId", "userId");

-- CreateIndex
CREATE INDEX "MemoryClaim_typeId_workspaceId_idx" ON "MemoryClaim"("typeId", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "MemoryMetric_typeId_userId_windowStart_windowEnd_key" ON "MemoryMetric"("typeId", "userId", "windowStart", "windowEnd");

-- CreateIndex
CREATE UNIQUE INDEX "MemoryMetric_typeId_workspaceId_windowStart_windowEnd_key" ON "MemoryMetric"("typeId", "workspaceId", "windowStart", "windowEnd");

-- CreateIndex
CREATE INDEX "MemoryMetric_workspaceId_windowStart_idx" ON "MemoryMetric"("workspaceId", "windowStart");

-- CreateIndex
CREATE INDEX "MemoryMetric_userId_windowStart_idx" ON "MemoryMetric"("userId", "windowStart");

-- AddForeignKey
ALTER TABLE "MemoryClaim" ADD CONSTRAINT "MemoryClaim_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "MemoryType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryClaim" ADD CONSTRAINT "MemoryClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryClaim" ADD CONSTRAINT "MemoryClaim_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryMetric" ADD CONSTRAINT "MemoryMetric_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "MemoryType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryMetric" ADD CONSTRAINT "MemoryMetric_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemoryMetric" ADD CONSTRAINT "MemoryMetric_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
