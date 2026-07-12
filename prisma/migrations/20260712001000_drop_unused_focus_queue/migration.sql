-- Focus queue history writes were removed in 2026-01 and no application code
-- reads this table. The live queue is computed directly from current tasks.
DROP TABLE "FocusQueue";
