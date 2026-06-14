-- Rename the per-task automation lifecycle enum to disambiguate it from the
-- per-workspace threshold escalation "stage". Renaming the type preserves all
-- existing column data (Task.automationState).
ALTER TYPE "AutomationState" RENAME TO "TaskAutomationState";
