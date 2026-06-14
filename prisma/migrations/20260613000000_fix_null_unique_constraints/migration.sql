-- Fix NULL-distinct unique-constraint gaps and add missing indexes.
--
-- Postgres treats NULL values as DISTINCT in unique indexes, so a plain
-- UNIQUE(a, b) with a nullable column does NOT prevent duplicate rows where
-- that column is NULL. This migration replaces the affected constraints with
-- correct partial (filtered) unique indexes and adds missing FK/expiry indexes.

-- ── UserAutomationSetting: make workspaceId NOT NULL ──────────────────────────
-- The app always writes a concrete workspaceId; null rows are unreachable via
-- the (userId, workspaceId) upsert key. Remove any stray nulls, then enforce.
DELETE FROM "UserAutomationSetting" WHERE "workspaceId" IS NULL;
ALTER TABLE "UserAutomationSetting" ALTER COLUMN "workspaceId" SET NOT NULL;

-- ── MemoryMetric: replace broken unique constraints with partial uniques ──────
DROP INDEX IF EXISTS "MemoryMetric_typeId_userId_windowStart_windowEnd_key";
DROP INDEX IF EXISTS "MemoryMetric_typeId_workspaceId_windowStart_windowEnd_key";

CREATE UNIQUE INDEX "MemoryMetric_user_window_key"
  ON "MemoryMetric" ("typeId", "userId", "windowStart", "windowEnd")
  WHERE "userId" IS NOT NULL;

CREATE UNIQUE INDEX "MemoryMetric_workspace_window_key"
  ON "MemoryMetric" ("typeId", "workspaceId", "windowStart", "windowEnd")
  WHERE "workspaceId" IS NOT NULL;

-- ── MemoryClaim: enforce a single ACTIVE claim per (type, scope) ──────────────
CREATE UNIQUE INDEX "MemoryClaim_active_user_key"
  ON "MemoryClaim" ("typeId", "userId")
  WHERE "status" = 'ACTIVE' AND "userId" IS NOT NULL;

CREATE UNIQUE INDEX "MemoryClaim_active_workspace_key"
  ON "MemoryClaim" ("typeId", "workspaceId")
  WHERE "status" = 'ACTIVE' AND "workspaceId" IS NOT NULL;

-- ── Missing indexes on FK / expiry columns ────────────────────────────────────
CREATE INDEX IF NOT EXISTS "Session_userId_idx" ON "Session" ("userId");
CREATE INDEX IF NOT EXISTS "Session_expires_idx" ON "Session" ("expires");

CREATE INDEX IF NOT EXISTS "EmailVerificationToken_userId_idx" ON "EmailVerificationToken" ("userId");
CREATE INDEX IF NOT EXISTS "EmailVerificationToken_expiresAt_idx" ON "EmailVerificationToken" ("expiresAt");

CREATE INDEX IF NOT EXISTS "PasswordResetToken_userId_idx" ON "PasswordResetToken" ("userId");
CREATE INDEX IF NOT EXISTS "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken" ("expiresAt");

CREATE INDEX IF NOT EXISTS "WorkspaceInvite_workspaceId_idx" ON "WorkspaceInvite" ("workspaceId");
CREATE INDEX IF NOT EXISTS "WorkspaceInvite_email_idx" ON "WorkspaceInvite" ("email");
CREATE INDEX IF NOT EXISTS "WorkspaceInvite_expiresAt_idx" ON "WorkspaceInvite" ("expiresAt");

CREATE INDEX IF NOT EXISTS "AiUsage_taskId_idx" ON "AiUsage" ("taskId");
