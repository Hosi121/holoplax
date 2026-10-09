-- D1 baseline: dates are Unix milliseconds; arrays and JSON use JSON text.

CREATE TABLE "_Revision" ("tableName" TEXT PRIMARY KEY, "version" INTEGER NOT NULL DEFAULT 0);

CREATE TABLE "_CommandGuard" ("id" TEXT PRIMARY KEY, "valid" INTEGER NOT NULL CONSTRAINT "command_snapshot_current" CHECK ("valid" = 1));

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "name" TEXT,
  "email" TEXT,
  "emailVerified" INTEGER,
  "image" TEXT,
  "role" TEXT NOT NULL DEFAULT 'USER' CHECK ("role" IN ('ADMIN', 'USER')),
  "disabledAt" INTEGER,
  "onboardingCompletedAt" INTEGER,
  "passwordChangedAt" INTEGER,
  "createdAt" INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  "updatedAt" INTEGER NOT NULL,
  PRIMARY KEY ("id"),
  UNIQUE ("email")
);

INSERT INTO "_Revision" ("tableName") VALUES ('User');

CREATE TRIGGER "User_revision_insert" AFTER INSERT ON "User" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'User'; END;

CREATE TRIGGER "User_revision_update" AFTER UPDATE ON "User" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'User'; END;

CREATE TRIGGER "User_revision_delete" AFTER DELETE ON "User" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'User'; END;

CREATE TABLE "Account" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerAccountId" TEXT NOT NULL,
  "refresh_token" TEXT,
  "access_token" TEXT,
  "expires_at" INTEGER,
  "token_type" TEXT,
  "scope" TEXT,
  "id_token" TEXT,
  "session_state" TEXT,
  "createdAt" INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  "updatedAt" INTEGER NOT NULL,
  PRIMARY KEY ("id"),
  UNIQUE ("provider", "providerAccountId"),
  FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "_Revision" ("tableName") VALUES ('Account');

CREATE TRIGGER "Account_revision_insert" AFTER INSERT ON "Account" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'Account'; END;

CREATE TRIGGER "Account_revision_update" AFTER UPDATE ON "Account" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'Account'; END;

CREATE TRIGGER "Account_revision_delete" AFTER DELETE ON "Account" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'Account'; END;

CREATE TABLE "Session" (
  "id" TEXT NOT NULL,
  "sessionToken" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "expires" INTEGER NOT NULL,
  "createdAt" INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  "updatedAt" INTEGER NOT NULL,
  PRIMARY KEY ("id"),
  UNIQUE ("sessionToken"),
  FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Session_idx_0" ON "Session" ("userId");

CREATE INDEX "Session_idx_1" ON "Session" ("expires");

INSERT INTO "_Revision" ("tableName") VALUES ('Session');

CREATE TRIGGER "Session_revision_insert" AFTER INSERT ON "Session" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'Session'; END;

CREATE TRIGGER "Session_revision_update" AFTER UPDATE ON "Session" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'Session'; END;

CREATE TRIGGER "Session_revision_delete" AFTER DELETE ON "Session" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'Session'; END;

CREATE TABLE "UserPassword" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "hash" TEXT NOT NULL,
  "createdAt" INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  "updatedAt" INTEGER NOT NULL,
  PRIMARY KEY ("id"),
  UNIQUE ("userId"),
  FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "_Revision" ("tableName") VALUES ('UserPassword');

CREATE TRIGGER "UserPassword_revision_insert" AFTER INSERT ON "UserPassword" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'UserPassword'; END;

CREATE TRIGGER "UserPassword_revision_update" AFTER UPDATE ON "UserPassword" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'UserPassword'; END;

CREATE TRIGGER "UserPassword_revision_delete" AFTER DELETE ON "UserPassword" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'UserPassword'; END;

CREATE TABLE "EmailVerificationToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "expiresAt" INTEGER NOT NULL,
  "createdAt" INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  PRIMARY KEY ("id"),
  UNIQUE ("token"),
  FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "EmailVerificationToken_idx_0" ON "EmailVerificationToken" ("userId");

CREATE INDEX "EmailVerificationToken_idx_1" ON "EmailVerificationToken" ("expiresAt");

INSERT INTO "_Revision" ("tableName") VALUES ('EmailVerificationToken');

CREATE TRIGGER "EmailVerificationToken_revision_insert" AFTER INSERT ON "EmailVerificationToken" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'EmailVerificationToken'; END;

CREATE TRIGGER "EmailVerificationToken_revision_update" AFTER UPDATE ON "EmailVerificationToken" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'EmailVerificationToken'; END;

CREATE TRIGGER "EmailVerificationToken_revision_delete" AFTER DELETE ON "EmailVerificationToken" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'EmailVerificationToken'; END;

CREATE TABLE "PasswordResetToken" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "expiresAt" INTEGER NOT NULL,
  "used" INTEGER NOT NULL DEFAULT 0 CHECK ("used" IN (0, 1)),
  "createdAt" INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  PRIMARY KEY ("id"),
  UNIQUE ("token"),
  FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "PasswordResetToken_idx_0" ON "PasswordResetToken" ("userId");

CREATE INDEX "PasswordResetToken_idx_1" ON "PasswordResetToken" ("expiresAt");

INSERT INTO "_Revision" ("tableName") VALUES ('PasswordResetToken');

CREATE TRIGGER "PasswordResetToken_revision_insert" AFTER INSERT ON "PasswordResetToken" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'PasswordResetToken'; END;

CREATE TRIGGER "PasswordResetToken_revision_update" AFTER UPDATE ON "PasswordResetToken" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'PasswordResetToken'; END;

CREATE TRIGGER "PasswordResetToken_revision_delete" AFTER DELETE ON "PasswordResetToken" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'PasswordResetToken'; END;

CREATE TABLE "VerificationToken" (
  "identifier" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "expires" INTEGER NOT NULL,
  PRIMARY KEY ("token"),
  UNIQUE ("token"),
  UNIQUE ("identifier", "token")
);

INSERT INTO "_Revision" ("tableName") VALUES ('VerificationToken');

CREATE TRIGGER "VerificationToken_revision_insert" AFTER INSERT ON "VerificationToken" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'VerificationToken'; END;

CREATE TRIGGER "VerificationToken_revision_update" AFTER UPDATE ON "VerificationToken" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'VerificationToken'; END;

CREATE TRIGGER "VerificationToken_revision_delete" AFTER DELETE ON "VerificationToken" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'VerificationToken'; END;

CREATE TABLE "Workspace" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "ownerId" TEXT NOT NULL,
  "createdAt" INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  "updatedAt" INTEGER NOT NULL,
  PRIMARY KEY ("id"),
  FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "_Revision" ("tableName") VALUES ('Workspace');

CREATE TRIGGER "Workspace_revision_insert" AFTER INSERT ON "Workspace" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'Workspace'; END;

CREATE TRIGGER "Workspace_revision_update" AFTER UPDATE ON "Workspace" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'Workspace'; END;

CREATE TRIGGER "Workspace_revision_delete" AFTER DELETE ON "Workspace" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'Workspace'; END;

CREATE TABLE "WorkspaceMember" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'member' CHECK ("role" IN ('owner', 'admin', 'member')),
  "createdAt" INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  PRIMARY KEY ("id"),
  UNIQUE ("workspaceId", "userId"),
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "WorkspaceMember_idx_0" ON "WorkspaceMember" ("userId");

INSERT INTO "_Revision" ("tableName") VALUES ('WorkspaceMember');

CREATE TRIGGER "WorkspaceMember_revision_insert" AFTER INSERT ON "WorkspaceMember" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'WorkspaceMember'; END;

CREATE TRIGGER "WorkspaceMember_revision_update" AFTER UPDATE ON "WorkspaceMember" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'WorkspaceMember'; END;

CREATE TRIGGER "WorkspaceMember_revision_delete" AFTER DELETE ON "WorkspaceMember" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'WorkspaceMember'; END;

CREATE TABLE "WorkspaceInvite" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'member' CHECK ("role" IN ('owner', 'admin', 'member')),
  "token" TEXT NOT NULL,
  "expiresAt" INTEGER NOT NULL,
  "acceptedAt" INTEGER,
  "createdAt" INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  PRIMARY KEY ("id"),
  UNIQUE ("token"),
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "WorkspaceInvite_idx_0" ON "WorkspaceInvite" ("workspaceId");

CREATE INDEX "WorkspaceInvite_idx_1" ON "WorkspaceInvite" ("email");

CREATE INDEX "WorkspaceInvite_idx_2" ON "WorkspaceInvite" ("expiresAt");

INSERT INTO "_Revision" ("tableName") VALUES ('WorkspaceInvite');

CREATE TRIGGER "WorkspaceInvite_revision_insert" AFTER INSERT ON "WorkspaceInvite" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'WorkspaceInvite'; END;

CREATE TRIGGER "WorkspaceInvite_revision_update" AFTER UPDATE ON "WorkspaceInvite" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'WorkspaceInvite'; END;

CREATE TRIGGER "WorkspaceInvite_revision_delete" AFTER DELETE ON "WorkspaceInvite" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'WorkspaceInvite'; END;

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "actorId" TEXT,
  "action" TEXT NOT NULL,
  "targetUserId" TEXT,
  "targetWorkspaceId" TEXT,
  "metadata" TEXT CHECK ("metadata" IS NULL OR json_valid("metadata")),
  "createdAt" INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  PRIMARY KEY ("id"),
  FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  FOREIGN KEY ("targetUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  FOREIGN KEY ("targetWorkspaceId") REFERENCES "Workspace" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "AuditLog_idx_0" ON "AuditLog" ("actorId", "createdAt");

CREATE INDEX "AuditLog_idx_1" ON "AuditLog" ("targetWorkspaceId", "createdAt");

CREATE INDEX "AuditLog_idx_2" ON "AuditLog" ("action", "createdAt");

CREATE INDEX "AuditLog_idx_3" ON "AuditLog" ("targetUserId", "createdAt");

INSERT INTO "_Revision" ("tableName") VALUES ('AuditLog');

CREATE TRIGGER "AuditLog_revision_insert" AFTER INSERT ON "AuditLog" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'AuditLog'; END;

CREATE TRIGGER "AuditLog_revision_update" AFTER UPDATE ON "AuditLog" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'AuditLog'; END;

CREATE TRIGGER "AuditLog_revision_delete" AFTER DELETE ON "AuditLog" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'AuditLog'; END;

CREATE TABLE "Task" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "definitionOfDone" TEXT NOT NULL DEFAULT '',
  "checklist" TEXT CHECK ("checklist" IS NULL OR json_valid("checklist")),
  "points" INTEGER NOT NULL,
  "urgency" TEXT NOT NULL DEFAULT 'MEDIUM' CHECK ("urgency" IN ('LOW', 'MEDIUM', 'HIGH')),
  "risk" TEXT NOT NULL DEFAULT 'MEDIUM' CHECK ("risk" IN ('LOW', 'MEDIUM', 'HIGH')),
  "workflowState" TEXT NOT NULL DEFAULT 'READY' CHECK ("workflowState" IN ('READY', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELED')),
  "type" TEXT NOT NULL DEFAULT 'PBI' CHECK ("type" IN ('EPIC', 'PBI', 'TASK')),
  "automationStatus" TEXT NOT NULL DEFAULT 'NONE' CHECK ("automationStatus" IN ('NONE', 'PREPARED', 'SPLIT_PENDING', 'SPLIT_REJECTED')),
  "hierarchyRole" TEXT NOT NULL DEFAULT 'STANDARD' CHECK ("hierarchyRole" IN ('STANDARD', 'SPLIT_PARENT', 'SPLIT_CHILD')),
  "origin" TEXT NOT NULL DEFAULT 'MANUAL' CHECK ("origin" IN ('MANUAL', 'INTAKE', 'AUTOMATION', 'ROUTINE', 'ONBOARDING')),
  "parentId" TEXT,
  "sprintId" TEXT,
  "routineSeriesId" TEXT,
  "dueDate" INTEGER,
  "assigneeId" TEXT,
  "tags" TEXT NOT NULL DEFAULT '[]' CHECK ("tags" IS NULL OR json_valid("tags")),
  "createdAt" INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  "updatedAt" INTEGER NOT NULL,
  "userId" TEXT,
  "workspaceId" TEXT NOT NULL,
  PRIMARY KEY ("id"),
  UNIQUE ("id", "workspaceId"),
  FOREIGN KEY ("sprintId") REFERENCES "Sprint" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  FOREIGN KEY ("assigneeId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("parentId") REFERENCES "Task" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  FOREIGN KEY ("routineSeriesId") REFERENCES "RoutineSeries" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CHECK ("points" IN (1, 2, 3, 5, 8, 13, 21, 34))
);

CREATE INDEX "Task_idx_0" ON "Task" ("parentId");

CREATE INDEX "Task_idx_1" ON "Task" ("workspaceId", "workflowState", "createdAt", "id");

CREATE INDEX "Task_idx_2" ON "Task" ("workspaceId", "createdAt", "id");

CREATE INDEX "Task_idx_3" ON "Task" ("workspaceId", "automationStatus");

CREATE INDEX "Task_idx_4" ON "Task" ("routineSeriesId", "createdAt");

CREATE INDEX "Task_idx_5" ON "Task" ("sprintId", "workflowState");

INSERT INTO "_Revision" ("tableName") VALUES ('Task');

CREATE TRIGGER "Task_revision_insert" AFTER INSERT ON "Task" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'Task'; END;

CREATE TRIGGER "Task_revision_update" AFTER UPDATE ON "Task" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'Task'; END;

CREATE TRIGGER "Task_revision_delete" AFTER DELETE ON "Task" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'Task'; END;

CREATE TABLE "VelocityEntry" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "points" INTEGER NOT NULL,
  "range" TEXT NOT NULL,
  "createdAt" INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  "userId" TEXT,
  "workspaceId" TEXT,
  "sprintId" TEXT,
  PRIMARY KEY ("id"),
  UNIQUE ("sprintId"),
  FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("sprintId") REFERENCES "Sprint" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "VelocityEntry_idx_0" ON "VelocityEntry" ("workspaceId", "createdAt");

INSERT INTO "_Revision" ("tableName") VALUES ('VelocityEntry');

CREATE TRIGGER "VelocityEntry_revision_insert" AFTER INSERT ON "VelocityEntry" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'VelocityEntry'; END;

CREATE TRIGGER "VelocityEntry_revision_update" AFTER UPDATE ON "VelocityEntry" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'VelocityEntry'; END;

CREATE TRIGGER "VelocityEntry_revision_delete" AFTER DELETE ON "VelocityEntry" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'VelocityEntry'; END;

CREATE TABLE "AiProviderSetting" (
  "id" INTEGER NOT NULL DEFAULT 1,
  "model" TEXT NOT NULL,
  "apiKey" TEXT NOT NULL,
  "baseUrl" TEXT,
  "enabled" INTEGER NOT NULL DEFAULT 1 CHECK ("enabled" IN (0, 1)),
  "createdAt" INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  "updatedAt" INTEGER NOT NULL,
  PRIMARY KEY ("id")
);

INSERT INTO "_Revision" ("tableName") VALUES ('AiProviderSetting');

CREATE TRIGGER "AiProviderSetting_revision_insert" AFTER INSERT ON "AiProviderSetting" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'AiProviderSetting'; END;

CREATE TRIGGER "AiProviderSetting_revision_update" AFTER UPDATE ON "AiProviderSetting" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'AiProviderSetting'; END;

CREATE TRIGGER "AiProviderSetting_revision_delete" AFTER DELETE ON "AiProviderSetting" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'AiProviderSetting'; END;

CREATE TABLE "AiPricing" (
  "id" TEXT NOT NULL,
  "provider" TEXT NOT NULL CHECK ("provider" IN ('OPENAI', 'OPENAI_COMPATIBLE', 'ANTHROPIC', 'GEMINI')),
  "model" TEXT NOT NULL,
  "inputUsdPerM" REAL NOT NULL,
  "outputUsdPerM" REAL NOT NULL,
  "createdAt" INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  "updatedAt" INTEGER NOT NULL,
  PRIMARY KEY ("id"),
  UNIQUE ("provider", "model")
);

INSERT INTO "_Revision" ("tableName") VALUES ('AiPricing');

CREATE TRIGGER "AiPricing_revision_insert" AFTER INSERT ON "AiPricing" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'AiPricing'; END;

CREATE TRIGGER "AiPricing_revision_update" AFTER UPDATE ON "AiPricing" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'AiPricing'; END;

CREATE TRIGGER "AiPricing_revision_delete" AFTER DELETE ON "AiPricing" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'AiPricing'; END;

CREATE TABLE "UserAutomationSetting" (
  "id" TEXT NOT NULL,
  "low" INTEGER NOT NULL,
  "high" INTEGER NOT NULL,
  "stage" INTEGER NOT NULL DEFAULT 0,
  "lastStageAt" INTEGER,
  "updatedAt" INTEGER NOT NULL,
  "createdAt" INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  "userId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  PRIMARY KEY ("id"),
  UNIQUE ("userId", "workspaceId"),
  FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "_Revision" ("tableName") VALUES ('UserAutomationSetting');

CREATE TRIGGER "UserAutomationSetting_revision_insert" AFTER INSERT ON "UserAutomationSetting" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'UserAutomationSetting'; END;

CREATE TRIGGER "UserAutomationSetting_revision_update" AFTER UPDATE ON "UserAutomationSetting" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'UserAutomationSetting'; END;

CREATE TRIGGER "UserAutomationSetting_revision_delete" AFTER DELETE ON "UserAutomationSetting" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'UserAutomationSetting'; END;

CREATE TABLE "AutomationStageHistory" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "workspaceId" TEXT,
  "stage" INTEGER NOT NULL,
  "reason" TEXT,
  "createdAt" INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  PRIMARY KEY ("id"),
  FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "AutomationStageHistory_idx_0" ON "AutomationStageHistory" ("userId", "createdAt");

CREATE INDEX "AutomationStageHistory_idx_1" ON "AutomationStageHistory" ("workspaceId", "createdAt");

INSERT INTO "_Revision" ("tableName") VALUES ('AutomationStageHistory');

CREATE TRIGGER "AutomationStageHistory_revision_insert" AFTER INSERT ON "AutomationStageHistory" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'AutomationStageHistory'; END;

CREATE TRIGGER "AutomationStageHistory_revision_update" AFTER UPDATE ON "AutomationStageHistory" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'AutomationStageHistory'; END;

CREATE TRIGGER "AutomationStageHistory_revision_delete" AFTER DELETE ON "AutomationStageHistory" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'AutomationStageHistory'; END;

CREATE TABLE "RoutineRule" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "seriesId" TEXT NOT NULL,
  "cadence" TEXT NOT NULL CHECK ("cadence" IN ('DAILY', 'WEEKLY')),
  "nextAt" INTEGER NOT NULL,
  "timezone" TEXT NOT NULL DEFAULT 'UTC',
  "createdAt" INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  "updatedAt" INTEGER NOT NULL,
  PRIMARY KEY ("id"),
  UNIQUE ("taskId"),
  UNIQUE ("seriesId"),
  FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("seriesId") REFERENCES "RoutineSeries" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "_Revision" ("tableName") VALUES ('RoutineRule');

CREATE TRIGGER "RoutineRule_revision_insert" AFTER INSERT ON "RoutineRule" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'RoutineRule'; END;

CREATE TRIGGER "RoutineRule_revision_update" AFTER UPDATE ON "RoutineRule" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'RoutineRule'; END;

CREATE TRIGGER "RoutineRule_revision_delete" AFTER DELETE ON "RoutineRule" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'RoutineRule'; END;

CREATE TABLE "RoutineSeries" (
  "id" TEXT NOT NULL,
  "cadence" TEXT NOT NULL CHECK ("cadence" IN ('DAILY', 'WEEKLY')),
  "nextAt" INTEGER NOT NULL,
  "timezone" TEXT NOT NULL DEFAULT 'UTC',
  "active" INTEGER NOT NULL DEFAULT 1 CHECK ("active" IN (0, 1)),
  "workspaceId" TEXT NOT NULL,
  "createdById" TEXT,
  "createdAt" INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  "updatedAt" INTEGER NOT NULL,
  PRIMARY KEY ("id"),
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "RoutineSeries_idx_0" ON "RoutineSeries" ("workspaceId", "active", "nextAt");

INSERT INTO "_Revision" ("tableName") VALUES ('RoutineSeries');

CREATE TRIGGER "RoutineSeries_revision_insert" AFTER INSERT ON "RoutineSeries" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'RoutineSeries'; END;

CREATE TRIGGER "RoutineSeries_revision_update" AFTER UPDATE ON "RoutineSeries" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'RoutineSeries'; END;

CREATE TRIGGER "RoutineSeries_revision_delete" AFTER DELETE ON "RoutineSeries" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'RoutineSeries'; END;

CREATE TABLE "AiSuggestion" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL CHECK ("type" IN ('TIP', 'SCORE', 'SPLIT')),
  "taskId" TEXT,
  "inputTitle" TEXT NOT NULL,
  "inputDescription" TEXT NOT NULL,
  "output" TEXT NOT NULL,
  "createdAt" INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  "userId" TEXT,
  "workspaceId" TEXT,
  PRIMARY KEY ("id"),
  FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "AiSuggestion_idx_0" ON "AiSuggestion" ("type", "createdAt");

CREATE INDEX "AiSuggestion_idx_1" ON "AiSuggestion" ("userId", "type", "createdAt");

INSERT INTO "_Revision" ("tableName") VALUES ('AiSuggestion');

CREATE TRIGGER "AiSuggestion_revision_insert" AFTER INSERT ON "AiSuggestion" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'AiSuggestion'; END;

CREATE TRIGGER "AiSuggestion_revision_update" AFTER UPDATE ON "AiSuggestion" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'AiSuggestion'; END;

CREATE TRIGGER "AiSuggestion_revision_delete" AFTER DELETE ON "AiSuggestion" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'AiSuggestion'; END;

CREATE TABLE "AiSuggestionReaction" (
  "id" TEXT NOT NULL,
  "suggestionId" TEXT NOT NULL,
  "reaction" TEXT NOT NULL CHECK ("reaction" IN ('VIEWED', 'ACCEPTED', 'MODIFIED', 'REJECTED', 'IGNORED')),
  "taskType" TEXT CHECK ("taskType" IN ('EPIC', 'PBI', 'TASK')),
  "taskPoints" INTEGER,
  "hourOfDay" INTEGER,
  "dayOfWeek" INTEGER,
  "wipCount" INTEGER,
  "flowState" REAL,
  "modification" TEXT CHECK ("modification" IS NULL OR json_valid("modification")),
  "viewedAt" INTEGER,
  "reactedAt" INTEGER,
  "latencyMs" INTEGER,
  "userId" TEXT NOT NULL,
  "workspaceId" TEXT,
  "createdAt" INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  PRIMARY KEY ("id"),
  FOREIGN KEY ("suggestionId") REFERENCES "AiSuggestion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "AiSuggestionReaction_idx_0" ON "AiSuggestionReaction" ("suggestionId");

CREATE INDEX "AiSuggestionReaction_idx_1" ON "AiSuggestionReaction" ("userId", "reaction", "createdAt");

CREATE INDEX "AiSuggestionReaction_idx_2" ON "AiSuggestionReaction" ("workspaceId", "reaction", "createdAt");

INSERT INTO "_Revision" ("tableName") VALUES ('AiSuggestionReaction');

CREATE TRIGGER "AiSuggestionReaction_revision_insert" AFTER INSERT ON "AiSuggestionReaction" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'AiSuggestionReaction'; END;

CREATE TRIGGER "AiSuggestionReaction_revision_update" AFTER UPDATE ON "AiSuggestionReaction" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'AiSuggestionReaction'; END;

CREATE TRIGGER "AiSuggestionReaction_revision_delete" AFTER DELETE ON "AiSuggestionReaction" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'AiSuggestionReaction'; END;

CREATE TABLE "AiPrepOutput" (
  "id" TEXT NOT NULL,
  "type" TEXT NOT NULL CHECK ("type" IN ('EMAIL', 'IMPLEMENTATION', 'CHECKLIST')),
  "status" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING', 'APPROVED', 'APPLIED', 'REJECTED')),
  "taskId" TEXT NOT NULL,
  "output" TEXT NOT NULL,
  "createdAt" INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  "updatedAt" INTEGER NOT NULL,
  "userId" TEXT,
  "workspaceId" TEXT,
  PRIMARY KEY ("id"),
  FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "AiPrepOutput_idx_0" ON "AiPrepOutput" ("taskId", "createdAt");

INSERT INTO "_Revision" ("tableName") VALUES ('AiPrepOutput');

CREATE TRIGGER "AiPrepOutput_revision_insert" AFTER INSERT ON "AiPrepOutput" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'AiPrepOutput'; END;

CREATE TRIGGER "AiPrepOutput_revision_update" AFTER UPDATE ON "AiPrepOutput" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'AiPrepOutput'; END;

CREATE TRIGGER "AiPrepOutput_revision_delete" AFTER DELETE ON "AiPrepOutput" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'AiPrepOutput'; END;

CREATE TABLE "AiUsage" (
  "id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "promptTokens" INTEGER,
  "completionTokens" INTEGER,
  "totalTokens" INTEGER,
  "costUsd" REAL,
  "usageSource" TEXT NOT NULL,
  "feature" TEXT,
  "taskId" TEXT,
  "userId" TEXT,
  "workspaceId" TEXT,
  "createdAt" INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  PRIMARY KEY ("id"),
  FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "AiUsage_idx_0" ON "AiUsage" ("workspaceId", "createdAt");

CREATE INDEX "AiUsage_idx_1" ON "AiUsage" ("userId", "createdAt");

CREATE INDEX "AiUsage_idx_2" ON "AiUsage" ("action", "createdAt");

CREATE INDEX "AiUsage_idx_3" ON "AiUsage" ("taskId");

INSERT INTO "_Revision" ("tableName") VALUES ('AiUsage');

CREATE TRIGGER "AiUsage_revision_insert" AFTER INSERT ON "AiUsage" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'AiUsage'; END;

CREATE TRIGGER "AiUsage_revision_update" AFTER UPDATE ON "AiUsage" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'AiUsage'; END;

CREATE TRIGGER "AiUsage_revision_delete" AFTER DELETE ON "AiUsage" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'AiUsage'; END;

CREATE TABLE "Sprint" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE' CHECK ("status" IN ('ACTIVE', 'CLOSED')),
  "capacityPoints" INTEGER NOT NULL,
  "startedAt" INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  "plannedEndAt" INTEGER,
  "endedAt" INTEGER,
  "userId" TEXT,
  "workspaceId" TEXT NOT NULL,
  "createdAt" INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  "updatedAt" INTEGER NOT NULL,
  PRIMARY KEY ("id"),
  FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CHECK ("capacityPoints" > 0),
  CHECK ("plannedEndAt" IS NULL OR "plannedEndAt" >= "startedAt")
);

INSERT INTO "_Revision" ("tableName") VALUES ('Sprint');

CREATE TRIGGER "Sprint_revision_insert" AFTER INSERT ON "Sprint" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'Sprint'; END;

CREATE TRIGGER "Sprint_revision_update" AFTER UPDATE ON "Sprint" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'Sprint'; END;

CREATE TRIGGER "Sprint_revision_delete" AFTER DELETE ON "Sprint" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'Sprint'; END;

CREATE TABLE "TaskDependency" (
  "taskId" TEXT NOT NULL,
  "dependsOnId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'REQUIRED' CHECK ("state" IN ('REQUIRED', 'WAIVED')),
  "waivedAt" INTEGER,
  PRIMARY KEY ("taskId", "dependsOnId"),
  FOREIGN KEY ("taskId", "workspaceId") REFERENCES "Task" ("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("dependsOnId", "workspaceId") REFERENCES "Task" ("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE,
  CHECK ("taskId" <> "dependsOnId")
);

CREATE INDEX "TaskDependency_idx_0" ON "TaskDependency" ("taskId", "state");

CREATE INDEX "TaskDependency_idx_1" ON "TaskDependency" ("workspaceId", "state");

INSERT INTO "_Revision" ("tableName") VALUES ('TaskDependency');

CREATE TRIGGER "TaskDependency_revision_insert" AFTER INSERT ON "TaskDependency" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'TaskDependency'; END;

CREATE TRIGGER "TaskDependency_revision_update" AFTER UPDATE ON "TaskDependency" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'TaskDependency'; END;

CREATE TRIGGER "TaskDependency_revision_delete" AFTER DELETE ON "TaskDependency" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'TaskDependency'; END;

CREATE TABLE "TaskDependencyEvent" (
  "id" TEXT NOT NULL,
  "taskId" TEXT,
  "taskKey" TEXT NOT NULL,
  "dependsOnId" TEXT,
  "dependsOnKey" TEXT NOT NULL,
  "type" TEXT NOT NULL CHECK ("type" IN ('REQUIRED', 'WAIVED')),
  "actorId" TEXT,
  "workspaceId" TEXT,
  "reason" TEXT,
  "createdAt" INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  PRIMARY KEY ("id"),
  FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  FOREIGN KEY ("dependsOnId") REFERENCES "Task" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "TaskDependencyEvent_idx_0" ON "TaskDependencyEvent" ("taskKey", "createdAt");

CREATE INDEX "TaskDependencyEvent_idx_1" ON "TaskDependencyEvent" ("dependsOnKey", "createdAt");

CREATE INDEX "TaskDependencyEvent_idx_2" ON "TaskDependencyEvent" ("workspaceId", "createdAt");

INSERT INTO "_Revision" ("tableName") VALUES ('TaskDependencyEvent');

CREATE TRIGGER "TaskDependencyEvent_revision_insert" AFTER INSERT ON "TaskDependencyEvent" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'TaskDependencyEvent'; END;

CREATE TRIGGER "TaskDependencyEvent_revision_update" AFTER UPDATE ON "TaskDependencyEvent" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'TaskDependencyEvent'; END;

CREATE TRIGGER "TaskDependencyEvent_revision_delete" AFTER DELETE ON "TaskDependencyEvent" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'TaskDependencyEvent'; END;

CREATE TABLE "TaskStatusEvent" (
  "id" TEXT NOT NULL,
  "taskId" TEXT,
  "taskKey" TEXT NOT NULL,
  "taskTitle" TEXT NOT NULL,
  "fromStatus" TEXT CHECK ("fromStatus" IN ('BACKLOG', 'SPRINT', 'DONE')),
  "toStatus" TEXT NOT NULL CHECK ("toStatus" IN ('BACKLOG', 'SPRINT', 'DONE')),
  "actorId" TEXT,
  "trigger" TEXT CHECK ("trigger" IN ('API', 'BULK', 'ROUTINE', 'SPRINT_END')),
  "workspaceId" TEXT,
  "createdAt" INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  PRIMARY KEY ("id"),
  FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "TaskStatusEvent_idx_0" ON "TaskStatusEvent" ("taskId", "createdAt");

CREATE INDEX "TaskStatusEvent_idx_1" ON "TaskStatusEvent" ("workspaceId", "createdAt");

INSERT INTO "_Revision" ("tableName") VALUES ('TaskStatusEvent');

CREATE TRIGGER "TaskStatusEvent_revision_insert" AFTER INSERT ON "TaskStatusEvent" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'TaskStatusEvent'; END;

CREATE TRIGGER "TaskStatusEvent_revision_update" AFTER UPDATE ON "TaskStatusEvent" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'TaskStatusEvent'; END;

CREATE TRIGGER "TaskStatusEvent_revision_delete" AFTER DELETE ON "TaskStatusEvent" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'TaskStatusEvent'; END;

CREATE TABLE "TaskWorkflowEvent" (
  "id" TEXT NOT NULL,
  "taskId" TEXT,
  "taskKey" TEXT NOT NULL,
  "taskCreatedAt" INTEGER,
  "taskDueDate" INTEGER,
  "taskPoints" INTEGER,
  "taskCreatorId" TEXT,
  "fromState" TEXT CHECK ("fromState" IN ('READY', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELED')),
  "toState" TEXT NOT NULL CHECK ("toState" IN ('READY', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELED')),
  "actorId" TEXT,
  "trigger" TEXT CHECK ("trigger" IN ('API', 'BULK', 'ROUTINE', 'SPRINT_END')),
  "workspaceId" TEXT,
  "createdAt" INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  PRIMARY KEY ("id"),
  FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "TaskWorkflowEvent_idx_0" ON "TaskWorkflowEvent" ("taskKey", "createdAt");

CREATE INDEX "TaskWorkflowEvent_idx_1" ON "TaskWorkflowEvent" ("workspaceId", "createdAt");

CREATE INDEX "TaskWorkflowEvent_idx_2" ON "TaskWorkflowEvent" ("workspaceId", "toState", "createdAt");

CREATE INDEX "TaskWorkflowEvent_idx_3" ON "TaskWorkflowEvent" ("taskCreatorId", "createdAt");

INSERT INTO "_Revision" ("tableName") VALUES ('TaskWorkflowEvent');

CREATE TRIGGER "TaskWorkflowEvent_revision_insert" AFTER INSERT ON "TaskWorkflowEvent" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'TaskWorkflowEvent'; END;

CREATE TRIGGER "TaskWorkflowEvent_revision_update" AFTER UPDATE ON "TaskWorkflowEvent" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'TaskWorkflowEvent'; END;

CREATE TRIGGER "TaskWorkflowEvent_revision_delete" AFTER DELETE ON "TaskWorkflowEvent" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'TaskWorkflowEvent'; END;

CREATE TABLE "SprintItem" (
  "id" TEXT NOT NULL,
  "sprintId" TEXT NOT NULL,
  "taskId" TEXT,
  "taskKey" TEXT NOT NULL,
  "taskTitle" TEXT NOT NULL,
  "taskType" TEXT NOT NULL CHECK ("taskType" IN ('EPIC', 'PBI', 'TASK')),
  "committedPoints" INTEGER NOT NULL,
  "outcome" TEXT NOT NULL DEFAULT 'COMMITTED' CHECK ("outcome" IN ('COMMITTED', 'COMPLETED', 'REMOVED', 'CARRYOVER')),
  "committedAt" INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  "completedAt" INTEGER,
  "removedAt" INTEGER,
  "carriedFromId" TEXT,
  PRIMARY KEY ("id"),
  UNIQUE ("sprintId", "taskKey"),
  FOREIGN KEY ("sprintId") REFERENCES "Sprint" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  FOREIGN KEY ("carriedFromId") REFERENCES "SprintItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "SprintItem_idx_0" ON "SprintItem" ("sprintId", "outcome");

CREATE INDEX "SprintItem_idx_1" ON "SprintItem" ("taskId", "committedAt");

CREATE INDEX "SprintItem_idx_2" ON "SprintItem" ("carriedFromId");

INSERT INTO "_Revision" ("tableName") VALUES ('SprintItem');

CREATE TRIGGER "SprintItem_revision_insert" AFTER INSERT ON "SprintItem" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'SprintItem'; END;

CREATE TRIGGER "SprintItem_revision_update" AFTER UPDATE ON "SprintItem" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'SprintItem'; END;

CREATE TRIGGER "SprintItem_revision_delete" AFTER DELETE ON "SprintItem" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'SprintItem'; END;

CREATE TABLE "SprintItemEvent" (
  "id" TEXT NOT NULL,
  "sprintItemId" TEXT NOT NULL,
  "type" TEXT NOT NULL CHECK ("type" IN ('COMMITTED', 'RECOMMITTED', 'COMPLETED', 'REOPENED', 'REMOVED', 'CARRYOVER')),
  "taskTitle" TEXT NOT NULL,
  "taskType" TEXT NOT NULL CHECK ("taskType" IN ('EPIC', 'PBI', 'TASK')),
  "committedPoints" INTEGER NOT NULL,
  "occurredAt" INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  PRIMARY KEY ("id"),
  FOREIGN KEY ("sprintItemId") REFERENCES "SprintItem" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "SprintItemEvent_idx_0" ON "SprintItemEvent" ("sprintItemId", "occurredAt");

INSERT INTO "_Revision" ("tableName") VALUES ('SprintItemEvent');

CREATE TRIGGER "SprintItemEvent_revision_insert" AFTER INSERT ON "SprintItemEvent" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'SprintItemEvent'; END;

CREATE TRIGGER "SprintItemEvent_revision_update" AFTER UPDATE ON "SprintItemEvent" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'SprintItemEvent'; END;

CREATE TRIGGER "SprintItemEvent_revision_delete" AFTER DELETE ON "SprintItemEvent" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'SprintItemEvent'; END;

CREATE TABLE "TaskAutomationJob" (
  "id" TEXT NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "taskId" TEXT,
  "taskKey" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "requestedById" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELED')),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  "lockedAt" INTEGER,
  "lockedBy" TEXT,
  "lastError" TEXT,
  "createdAt" INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  "updatedAt" INTEGER NOT NULL,
  PRIMARY KEY ("id"),
  UNIQUE ("dedupeKey"),
  FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("requestedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "TaskAutomationJob_idx_0" ON "TaskAutomationJob" ("status", "availableAt", "createdAt");

CREATE INDEX "TaskAutomationJob_idx_1" ON "TaskAutomationJob" ("taskKey", "createdAt");

CREATE INDEX "TaskAutomationJob_idx_2" ON "TaskAutomationJob" ("workspaceId", "status");

INSERT INTO "_Revision" ("tableName") VALUES ('TaskAutomationJob');

CREATE TRIGGER "TaskAutomationJob_revision_insert" AFTER INSERT ON "TaskAutomationJob" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'TaskAutomationJob'; END;

CREATE TRIGGER "TaskAutomationJob_revision_update" AFTER UPDATE ON "TaskAutomationJob" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'TaskAutomationJob'; END;

CREATE TRIGGER "TaskAutomationJob_revision_delete" AFTER DELETE ON "TaskAutomationJob" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'TaskAutomationJob'; END;

CREATE TABLE "DelegationJob" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "workspaceId" TEXT,
  "request" TEXT NOT NULL,
  "mode" TEXT NOT NULL DEFAULT 'SAFE_AUTO' CHECK ("mode" IN ('PREPARE', 'SAFE_AUTO')),
  "kind" TEXT NOT NULL CHECK ("kind" IN ('RESEARCH', 'WRITING', 'CODE', 'GENERAL')),
  "risk" TEXT NOT NULL CHECK ("risk" IN ('LOW', 'REVIEW', 'RESTRICTED')),
  "status" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING', 'RUNNING', 'NEEDS_APPROVAL', 'NEEDS_INPUT', 'SUCCEEDED', 'FAILED', 'CANCELED')),
  "approvalReason" TEXT,
  "plan" TEXT NOT NULL CHECK ("plan" IS NULL OR json_valid("plan")),
  "result" TEXT,
  "verification" TEXT CHECK ("verification" IS NULL OR json_valid("verification")),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  "lockedAt" INTEGER,
  "lockedBy" TEXT,
  "lastError" TEXT,
  "startedAt" INTEGER,
  "completedAt" INTEGER,
  "createdAt" INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  "updatedAt" INTEGER NOT NULL,
  PRIMARY KEY ("id"),
  FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "DelegationJob_idx_0" ON "DelegationJob" ("userId", "status", "createdAt");

CREATE INDEX "DelegationJob_idx_1" ON "DelegationJob" ("status", "availableAt", "createdAt");

CREATE INDEX "DelegationJob_idx_2" ON "DelegationJob" ("workspaceId", "createdAt");

INSERT INTO "_Revision" ("tableName") VALUES ('DelegationJob');

CREATE TRIGGER "DelegationJob_revision_insert" AFTER INSERT ON "DelegationJob" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'DelegationJob'; END;

CREATE TRIGGER "DelegationJob_revision_update" AFTER UPDATE ON "DelegationJob" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'DelegationJob'; END;

CREATE TRIGGER "DelegationJob_revision_delete" AFTER DELETE ON "DelegationJob" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'DelegationJob'; END;

CREATE TABLE "MemoryDefinition" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "scope" TEXT NOT NULL CHECK ("scope" IN ('USER', 'WORKSPACE')),
  "valueType" TEXT NOT NULL CHECK ("valueType" IN ('STRING', 'NUMBER', 'BOOL', 'JSON', 'RATIO', 'DURATION_MS', 'HISTOGRAM_24x7', 'RATIO_BY_TYPE')),
  "unit" TEXT,
  "granularity" TEXT NOT NULL,
  "updatePolicy" TEXT NOT NULL,
  "decayDays" INTEGER,
  "description" TEXT,
  "createdAt" INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  "updatedAt" INTEGER NOT NULL,
  PRIMARY KEY ("id"),
  UNIQUE ("key", "scope")
);

CREATE INDEX "MemoryDefinition_idx_0" ON "MemoryDefinition" ("scope");

INSERT INTO "_Revision" ("tableName") VALUES ('MemoryDefinition');

CREATE TRIGGER "MemoryDefinition_revision_insert" AFTER INSERT ON "MemoryDefinition" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'MemoryDefinition'; END;

CREATE TRIGGER "MemoryDefinition_revision_update" AFTER UPDATE ON "MemoryDefinition" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'MemoryDefinition'; END;

CREATE TRIGGER "MemoryDefinition_revision_delete" AFTER DELETE ON "MemoryDefinition" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'MemoryDefinition'; END;

CREATE TABLE "MemoryClaim" (
  "id" TEXT NOT NULL,
  "definitionId" TEXT NOT NULL,
  "userId" TEXT,
  "workspaceId" TEXT,
  "valueStr" TEXT,
  "valueNum" REAL,
  "valueBool" INTEGER CHECK ("valueBool" IN (0, 1)),
  "valueJson" TEXT CHECK ("valueJson" IS NULL OR json_valid("valueJson")),
  "confidence" REAL NOT NULL DEFAULT 0.5,
  "provenance" TEXT NOT NULL DEFAULT 'INFERRED' CHECK ("provenance" IN ('EXPLICIT', 'INFERRED')),
  "status" TEXT NOT NULL DEFAULT 'ACTIVE' CHECK ("status" IN ('ACTIVE', 'REJECTED', 'STALE')),
  "validFrom" INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  "validTo" INTEGER,
  "evidence" TEXT CHECK ("evidence" IS NULL OR json_valid("evidence")),
  "createdAt" INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  "updatedAt" INTEGER NOT NULL,
  PRIMARY KEY ("id"),
  FOREIGN KEY ("definitionId") REFERENCES "MemoryDefinition" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CHECK (("userId" IS NOT NULL) <> ("workspaceId" IS NOT NULL))
);

CREATE INDEX "MemoryClaim_idx_0" ON "MemoryClaim" ("definitionId", "userId");

CREATE INDEX "MemoryClaim_idx_1" ON "MemoryClaim" ("definitionId", "workspaceId");

INSERT INTO "_Revision" ("tableName") VALUES ('MemoryClaim');

CREATE TRIGGER "MemoryClaim_revision_insert" AFTER INSERT ON "MemoryClaim" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'MemoryClaim'; END;

CREATE TRIGGER "MemoryClaim_revision_update" AFTER UPDATE ON "MemoryClaim" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'MemoryClaim'; END;

CREATE TRIGGER "MemoryClaim_revision_delete" AFTER DELETE ON "MemoryClaim" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'MemoryClaim'; END;

CREATE TABLE "MemoryQuestion" (
  "id" TEXT NOT NULL,
  "definitionId" TEXT NOT NULL,
  "userId" TEXT,
  "workspaceId" TEXT,
  "valueStr" TEXT,
  "valueNum" REAL,
  "valueBool" INTEGER CHECK ("valueBool" IN (0, 1)),
  "valueJson" TEXT CHECK ("valueJson" IS NULL OR json_valid("valueJson")),
  "confidence" REAL NOT NULL DEFAULT 0.7,
  "status" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING', 'ACCEPTED', 'REJECTED', 'HOLD')),
  "createdAt" INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  "updatedAt" INTEGER NOT NULL,
  PRIMARY KEY ("id"),
  FOREIGN KEY ("definitionId") REFERENCES "MemoryDefinition" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CHECK (("userId" IS NOT NULL) <> ("workspaceId" IS NOT NULL))
);

CREATE INDEX "MemoryQuestion_idx_0" ON "MemoryQuestion" ("definitionId", "status");

CREATE INDEX "MemoryQuestion_idx_1" ON "MemoryQuestion" ("userId", "status");

CREATE INDEX "MemoryQuestion_idx_2" ON "MemoryQuestion" ("workspaceId", "status");

INSERT INTO "_Revision" ("tableName") VALUES ('MemoryQuestion');

CREATE TRIGGER "MemoryQuestion_revision_insert" AFTER INSERT ON "MemoryQuestion" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'MemoryQuestion'; END;

CREATE TRIGGER "MemoryQuestion_revision_update" AFTER UPDATE ON "MemoryQuestion" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'MemoryQuestion'; END;

CREATE TRIGGER "MemoryQuestion_revision_delete" AFTER DELETE ON "MemoryQuestion" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'MemoryQuestion'; END;

CREATE TABLE "MemoryMetric" (
  "id" TEXT NOT NULL,
  "definitionId" TEXT NOT NULL,
  "userId" TEXT,
  "workspaceId" TEXT,
  "windowStart" INTEGER NOT NULL,
  "windowEnd" INTEGER NOT NULL,
  "valueNum" REAL,
  "valueJson" TEXT CHECK ("valueJson" IS NULL OR json_valid("valueJson")),
  "computedAt" INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  PRIMARY KEY ("id"),
  FOREIGN KEY ("definitionId") REFERENCES "MemoryDefinition" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CHECK (("userId" IS NOT NULL) <> ("workspaceId" IS NOT NULL))
);

CREATE INDEX "MemoryMetric_idx_0" ON "MemoryMetric" ("workspaceId", "windowStart");

CREATE INDEX "MemoryMetric_idx_1" ON "MemoryMetric" ("userId", "windowStart");

INSERT INTO "_Revision" ("tableName") VALUES ('MemoryMetric');

CREATE TRIGGER "MemoryMetric_revision_insert" AFTER INSERT ON "MemoryMetric" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'MemoryMetric'; END;

CREATE TRIGGER "MemoryMetric_revision_update" AFTER UPDATE ON "MemoryMetric" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'MemoryMetric'; END;

CREATE TRIGGER "MemoryMetric_revision_delete" AFTER DELETE ON "MemoryMetric" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'MemoryMetric'; END;

CREATE TABLE "IntakeItem" (
  "id" TEXT NOT NULL,
  "origin" TEXT NOT NULL CHECK ("origin" IN ('MEMO', 'SLACK', 'DISCORD', 'EMAIL', 'CALENDAR')),
  "status" TEXT NOT NULL DEFAULT 'PENDING' CHECK ("status" IN ('PENDING', 'CONVERTED', 'DISMISSED')),
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "payload" TEXT CHECK ("payload" IS NULL OR json_valid("payload")),
  "userId" TEXT NOT NULL,
  "workspaceId" TEXT,
  "taskId" TEXT,
  "createdAt" INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  "updatedAt" INTEGER NOT NULL,
  PRIMARY KEY ("id"),
  FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "IntakeItem_idx_0" ON "IntakeItem" ("workspaceId", "status");

CREATE INDEX "IntakeItem_idx_1" ON "IntakeItem" ("userId", "status");

INSERT INTO "_Revision" ("tableName") VALUES ('IntakeItem');

CREATE TRIGGER "IntakeItem_revision_insert" AFTER INSERT ON "IntakeItem" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'IntakeItem'; END;

CREATE TRIGGER "IntakeItem_revision_update" AFTER UPDATE ON "IntakeItem" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'IntakeItem'; END;

CREATE TRIGGER "IntakeItem_revision_delete" AFTER DELETE ON "IntakeItem" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'IntakeItem'; END;

CREATE TABLE "TaskComment" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "editedAt" INTEGER,
  "createdAt" INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  "updatedAt" INTEGER NOT NULL,
  PRIMARY KEY ("id"),
  FOREIGN KEY ("taskId") REFERENCES "Task" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "TaskComment_idx_0" ON "TaskComment" ("taskId", "createdAt");

INSERT INTO "_Revision" ("tableName") VALUES ('TaskComment');

CREATE TRIGGER "TaskComment_revision_insert" AFTER INSERT ON "TaskComment" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'TaskComment'; END;

CREATE TRIGGER "TaskComment_revision_update" AFTER UPDATE ON "TaskComment" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'TaskComment'; END;

CREATE TRIGGER "TaskComment_revision_delete" AFTER DELETE ON "TaskComment" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'TaskComment'; END;

CREATE TABLE "McpApiKey" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "keyHash" TEXT NOT NULL,
  "keyPrefix" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "lastUsedAt" INTEGER,
  "expiresAt" INTEGER,
  "revokedAt" INTEGER,
  "createdAt" INTEGER NOT NULL DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)),
  PRIMARY KEY ("id"),
  UNIQUE ("keyHash"),
  FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "McpApiKey_idx_0" ON "McpApiKey" ("userId");

CREATE INDEX "McpApiKey_idx_1" ON "McpApiKey" ("workspaceId");

INSERT INTO "_Revision" ("tableName") VALUES ('McpApiKey');

CREATE TRIGGER "McpApiKey_revision_insert" AFTER INSERT ON "McpApiKey" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'McpApiKey'; END;

CREATE TRIGGER "McpApiKey_revision_update" AFTER UPDATE ON "McpApiKey" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'McpApiKey'; END;

CREATE TRIGGER "McpApiKey_revision_delete" AFTER DELETE ON "McpApiKey" BEGIN UPDATE "_Revision" SET "version" = "version" + 1 WHERE "tableName" = 'McpApiKey'; END;

CREATE UNIQUE INDEX "Sprint_one_active_workspace" ON "Sprint" ("workspaceId") WHERE "status" = 'ACTIVE';

CREATE UNIQUE INDEX "MemoryClaim_active_userId" ON "MemoryClaim" ("definitionId", "userId") WHERE "status" = 'ACTIVE' AND "userId" IS NOT NULL;

CREATE UNIQUE INDEX "MemoryMetric_window_userId" ON "MemoryMetric" ("definitionId", "userId", "windowStart", "windowEnd") WHERE "userId" IS NOT NULL;

CREATE UNIQUE INDEX "MemoryClaim_active_workspaceId" ON "MemoryClaim" ("definitionId", "workspaceId") WHERE "status" = 'ACTIVE' AND "workspaceId" IS NOT NULL;

CREATE UNIQUE INDEX "MemoryMetric_window_workspaceId" ON "MemoryMetric" ("definitionId", "workspaceId", "windowStart", "windowEnd") WHERE "workspaceId" IS NOT NULL;
