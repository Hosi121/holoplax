-- Durable personal delegation queue. The first executor produces and verifies
-- AI artifacts; external side effects remain gated until a scoped tool exists.
CREATE TYPE "DelegationMode" AS ENUM ('PREPARE', 'SAFE_AUTO');
CREATE TYPE "DelegationKind" AS ENUM ('RESEARCH', 'WRITING', 'CODE', 'GENERAL');
CREATE TYPE "DelegationRisk" AS ENUM ('LOW', 'REVIEW', 'RESTRICTED');
CREATE TYPE "DelegationJobStatus" AS ENUM (
  'PENDING', 'RUNNING', 'NEEDS_APPROVAL', 'NEEDS_INPUT',
  'SUCCEEDED', 'FAILED', 'CANCELED'
);

CREATE TABLE "DelegationJob" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "workspaceId" TEXT,
  "request" TEXT NOT NULL,
  "mode" "DelegationMode" NOT NULL DEFAULT 'SAFE_AUTO',
  "kind" "DelegationKind" NOT NULL,
  "risk" "DelegationRisk" NOT NULL,
  "status" "DelegationJobStatus" NOT NULL DEFAULT 'PENDING',
  "approvalReason" TEXT,
  "plan" JSONB NOT NULL,
  "result" TEXT,
  "verification" JSONB,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedAt" TIMESTAMP(3),
  "lockedBy" TEXT,
  "lastError" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DelegationJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DelegationJob_userId_status_createdAt_idx"
  ON "DelegationJob"("userId", "status", "createdAt" DESC);
CREATE INDEX "DelegationJob_status_availableAt_createdAt_idx"
  ON "DelegationJob"("status", "availableAt", "createdAt");
CREATE INDEX "DelegationJob_workspaceId_createdAt_idx"
  ON "DelegationJob"("workspaceId", "createdAt" DESC);

ALTER TABLE "DelegationJob" ADD CONSTRAINT "DelegationJob_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DelegationJob" ADD CONSTRAINT "DelegationJob_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DelegationJob" ADD CONSTRAINT "DelegationJob_lock_state_check"
  CHECK (
    (status = 'RUNNING' AND "lockedAt" IS NOT NULL AND "lockedBy" IS NOT NULL)
    OR
    (status <> 'RUNNING' AND "lockedAt" IS NULL AND "lockedBy" IS NULL)
  );
ALTER TABLE "DelegationJob" ADD CONSTRAINT "DelegationJob_terminal_time_check"
  CHECK (
    (status IN ('SUCCEEDED', 'FAILED', 'CANCELED') AND "completedAt" IS NOT NULL)
    OR
    (status NOT IN ('SUCCEEDED', 'FAILED', 'CANCELED') AND "completedAt" IS NULL)
  );
