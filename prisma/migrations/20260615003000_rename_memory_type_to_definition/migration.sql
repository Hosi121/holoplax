-- Rename the MemoryType entity to MemoryDefinition: it is a memory *attribute
-- definition*, not an enum/category, and "Type" collided with MemoryValueType
-- and the relation field. All renames are metadata-only (data preserved).
ALTER TABLE "MemoryType" RENAME TO "MemoryDefinition";
ALTER TABLE "MemoryClaim" RENAME COLUMN "typeId" TO "definitionId";
ALTER TABLE "MemoryQuestion" RENAME COLUMN "typeId" TO "definitionId";
ALTER TABLE "MemoryMetric" RENAME COLUMN "typeId" TO "definitionId";

-- Keep index/constraint names aligned with Prisma's conventions (no drift).
ALTER INDEX "MemoryType_pkey" RENAME TO "MemoryDefinition_pkey";
ALTER INDEX "MemoryType_key_scope_key" RENAME TO "MemoryDefinition_key_scope_key";
ALTER INDEX "MemoryType_scope_idx" RENAME TO "MemoryDefinition_scope_idx";
ALTER INDEX "MemoryClaim_typeId_userId_idx" RENAME TO "MemoryClaim_definitionId_userId_idx";
ALTER INDEX "MemoryClaim_typeId_workspaceId_idx" RENAME TO "MemoryClaim_definitionId_workspaceId_idx";
ALTER INDEX "MemoryQuestion_typeId_status_idx" RENAME TO "MemoryQuestion_definitionId_status_idx";

ALTER TABLE "MemoryClaim" RENAME CONSTRAINT "MemoryClaim_typeId_fkey" TO "MemoryClaim_definitionId_fkey";
ALTER TABLE "MemoryQuestion" RENAME CONSTRAINT "MemoryQuestion_typeId_fkey" TO "MemoryQuestion_definitionId_fkey";
ALTER TABLE "MemoryMetric" RENAME CONSTRAINT "MemoryMetric_typeId_fkey" TO "MemoryMetric_definitionId_fkey";
