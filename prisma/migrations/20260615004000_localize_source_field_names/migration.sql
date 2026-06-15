-- The field name "source" was an accidental homonym across four unrelated
-- contexts. Rename each to a context-local term (metadata-only, data preserved):
ALTER TABLE "TaskStatusEvent" RENAME COLUMN "source" TO "trigger";       -- who/what caused the transition
ALTER TABLE "IntakeItem"      RENAME COLUMN "source" TO "origin";        -- where the item came from
ALTER TABLE "MemoryClaim"     RENAME COLUMN "source" TO "provenance";    -- how the claim was obtained
ALTER TABLE "AiUsage"         RENAME COLUMN "source" TO "feature";       -- which AI feature produced the usage
