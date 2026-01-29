-- CreateIndex
CREATE INDEX "AiSuggestion_type_createdAt_idx" ON "AiSuggestion"("type", "createdAt");

-- CreateIndex
CREATE INDEX "AiSuggestion_userId_type_createdAt_idx" ON "AiSuggestion"("userId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_targetWorkspaceId_createdAt_idx" ON "AuditLog"("targetWorkspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_targetUserId_createdAt_idx" ON "AuditLog"("targetUserId", "createdAt");

-- CreateIndex
CREATE INDEX "Task_workspaceId_status_idx" ON "Task"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "Task_workspaceId_automationState_idx" ON "Task"("workspaceId", "automationState");

-- CreateIndex
CREATE INDEX "Task_sprintId_status_idx" ON "Task"("sprintId", "status");
