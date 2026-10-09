import { afterEach, beforeEach, expect, test } from "vitest";
import { convertPostgresExport, tableNames } from "../import";
import { createTestDatabase } from "../test-runtime";
import postgresSnapshot from "./fixtures/postgres-export.json";

let runtime: Awaited<ReturnType<typeof createTestDatabase>>;
beforeEach(async () => {
  runtime = await createTestDatabase();
});
afterEach(async () => {
  await runtime.dispose();
});
async function fixture() {
  const user = await runtime.db.user.create({
    data: { id: "legacy-user", email: "o'brien@example.test" },
  });
  const workspace = await runtime.db.workspace.create({
    data: { id: "legacy-workspace", name: "Legacy", ownerId: user.id },
  });
  const parent = await runtime.db.task.create({
    data: {
      id: "z-parent",
      title: "Parent",
      points: 3,
      workspaceId: workspace.id,
      tags: ["a", "秘密"],
    },
  });
  await runtime.db.task.create({
    data: {
      id: "a-child",
      title: "Child",
      points: 1,
      workspaceId: workspace.id,
      parentId: parent.id,
    },
  });
  await runtime.db.velocityEntry.create({
    data: { name: "Manual", points: 3, range: "1-5", userId: user.id, workspaceId: workspace.id },
  });
  const tables: Record<string, unknown[]> = {};
  for (const name of tableNames) {
    const raw = await runtime.db.query<Record<string, unknown>>(`SELECT * FROM "${name}"`);
    const { schema } = await import("../schema");
    const fields: Record<string, { kind: string }> = schema[name].fields;
    tables[name] = raw.map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => [
          key,
          value === null
            ? null
            : fields[key].kind === "date"
              ? new Date(Number(value)).toISOString()
              : fields[key].kind === "boolean"
                ? Boolean(value)
                : ["json", "array"].includes(fields[key].kind)
                  ? JSON.parse(String(value))
                  : value,
        ]),
      ),
    );
  }
  tables.Task.reverse();
  return { format: "holoplax-postgres-v1", tables };
}
test("imports opaque IDs, dates, arrays, SQL quotes, self references, and unassigned velocity history", async () => {
  const source = await fixture();
  const converted = convertPostgresExport(source);
  const target = await createTestDatabase();
  try {
    await target.binding.batch(converted.statements.map((sql) => target.binding.prepare(sql)));
    expect(await target.db.user.findUniqueOrThrow({ where: { id: "legacy-user" } })).toMatchObject({
      email: "o'brien@example.test",
    });
    expect(await target.db.task.findUniqueOrThrow({ where: { id: "z-parent" } })).toMatchObject({
      tags: ["a", "秘密"],
    });
    expect(await target.db.task.findUniqueOrThrow({ where: { id: "a-child" } })).toMatchObject({
      parentId: "z-parent",
    });
    expect(await target.db.velocityEntry.findFirst()).toMatchObject({ sprintId: null });
    expect(await target.db.query("PRAGMA foreign_key_check")).toEqual([]);
    await expect(
      target.binding.batch(converted.statements.map((sql) => target.binding.prepare(sql))),
    ).rejects.toThrow();
    expect(await target.db.task.count()).toBe(2);
  } finally {
    await target.dispose();
  }
});
test("rejects divergent legacy projections instead of silently discarding them", async () => {
  const source = await fixture();
  const task = source.tables.Task[0] as Record<string, unknown>;
  task.status = "DONE";
  expect(() => convertPostgresExport(source)).toThrow("Divergent Task.status");
  task.status = "BACKLOG";
  task.automationState = "SPLIT_PARENT";
  expect(() => convertPostgresExport(source)).toThrow("Divergent Task.automationState");
});

test("imports the actual legacy PostgreSQL timestamp format without inferring a host timezone", async () => {
  // PostgreSQL 16, schema.prisma at 272ee3d, Prisma 5.20.0 DDL, Asia/Tokyo + SQL/DMY session.
  const source = structuredClone(postgresSnapshot);
  const converted = convertPostgresExport(source);
  await runtime.binding.batch(converted.statements.map((sql) => runtime.binding.prepare(sql)));
  const user = await runtime.db.user.findUniqueOrThrow({ where: { id: "source-user" } });
  expect(user.createdAt.toISOString()).toBe("2026-10-08T18:23:45.678Z");
  expect(user.emailVerified).toBeNull();
  expect(await runtime.db.task.findUniqueOrThrow({ where: { id: "source-task" } })).toMatchObject({
    tags: ["a", "秘密"],
  });
  source.tables.User[0].createdAt = "2026-10-08T18:23:45.678";
  expect(() => convertPostgresExport(source)).toThrow("Expected a zoned timestamp");
});
