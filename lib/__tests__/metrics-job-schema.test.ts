import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("scheduled metrics job schema contract", () => {
  const source = readFileSync(resolve(process.cwd(), "scripts/metrics/metrics_job.py"), "utf8");

  it("uses the current memory model names", () => {
    expect(source).toContain('"MemoryDefinition"');
    expect(source).toContain('"definitionId"');
    expect(source).toContain('"provenance"');
    expect(source).not.toContain('"MemoryType"');
    expect(source).not.toContain('"typeId"');
  });

  it("derives completion from status events rather than Task.updatedAt", () => {
    expect(source).toContain('FROM "TaskStatusEvent"');
    expect(source).toContain('AS "doneAt"');
    expect(source).not.toContain('task["updatedAt"]');
  });
});
