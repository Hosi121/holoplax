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

  it("derives workflow metrics from workflow events rather than planning placement", () => {
    expect(source).toContain('FROM "TaskWorkflowEvent"');
    expect(source).toContain("\"toState\" IN ('IN_PROGRESS', 'BLOCKED')");
    expect(source).toContain('AS "doneAt"');
    expect(source).toContain('PARTITION BY e."taskKey"');
    expect(source).toContain('e."{event_owner_column}" = %s');
    expect(source).not.toContain('JOIN "Task" t ON t.id = e."taskId"');
    expect(source).not.toContain('task["updatedAt"]');
  });
});
