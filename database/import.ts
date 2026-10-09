import { schema } from "./schema";

type Row = Record<string, unknown>;
export const tableNames = Object.keys(schema) as (keyof typeof schema)[];
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
const literal = (value: unknown): string => {
  if (value === null) return "NULL";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string") return `'${value.replaceAll("'", "''")}'`;
  throw new Error("Invalid SQL value");
};

// One PostgreSQL statement exports one consistent snapshot, without a pg runtime dependency.
export function postgresExportSql() {
  const tables = tableNames.map((name) => {
    // The legacy Prisma migrations use timestamp(3) without time zone, stored as UTC.
    // Export explicit UTC strings instead of letting Date.parse infer the host timezone.
    const dates = Object.entries(schema[name].fields)
      .filter(([, field]) => field.kind === "date")
      .map(([key]) => `'${key}', to_char(t.${quote(key)}, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`);
    const row = `to_jsonb(t)${dates.length ? ` || jsonb_build_object(${dates.join(",")})` : ""}`;
    return `'${name}', (SELECT COALESCE(jsonb_agg(${row}), '[]'::jsonb) FROM ${quote(name)} t)`;
  });
  return `SELECT jsonb_build_object('format', 'holoplax-postgres-v1', 'tables', jsonb_build_object(${tables.join(",\n")}));\n`;
}

export function convertPostgresExport(input: unknown) {
  if (
    !input ||
    typeof input !== "object" ||
    !("format" in input) ||
    input.format !== "holoplax-postgres-v1" ||
    !("tables" in input) ||
    !input.tables ||
    typeof input.tables !== "object"
  )
    throw new Error("Invalid PostgreSQL export format");
  const source = input.tables as Record<string, unknown>;
  for (const name of Object.keys(source))
    if (!tableNames.includes(name as keyof typeof schema))
      throw new Error(`Unexpected table ${name}`);
  const rows = Object.fromEntries(
    tableNames.map((name) => {
      if (!Array.isArray(source[name])) throw new Error(`Missing table ${name}`);
      return [name, source[name] as Row[]];
    }),
  ) as Record<keyof typeof schema, Row[]>;
  const activeSprints = new Set(
    rows.Sprint.filter((row) => row.status === "ACTIVE").map((row) => row.id),
  );
  const statements: string[] = [];
  const counts: Record<string, number> = {};
  for (const name of tableNames) {
    const fields: Record<string, { kind: string; nullable: boolean }> = schema[name].fields;
    const columns = Object.keys(fields);
    counts[name] = rows[name].length;
    for (const row of rows[name]) {
      if (!row || typeof row !== "object" || Array.isArray(row))
        throw new Error(`Invalid ${name} row`);
      if ((name === "TaskAutomationJob" || name === "DelegationJob") && row.status === "RUNNING")
        throw new Error(`Stop and drain jobs before exporting ${name}`);
      if (name === "Task") {
        const status =
          row.workflowState === "DONE"
            ? "DONE"
            : activeSprints.has(row.sprintId)
              ? "SPRINT"
              : "BACKLOG";
        const automation =
          row.hierarchyRole === "SPLIT_PARENT" || row.hierarchyRole === "SPLIT_CHILD"
            ? row.hierarchyRole
            : row.automationStatus === "PREPARED"
              ? "DELEGATED"
              : row.automationStatus === "SPLIT_PENDING"
                ? "PENDING_SPLIT"
                : row.automationStatus === "SPLIT_REJECTED"
                  ? "SPLIT_REJECTED"
                  : "NONE";
        if (row.status !== undefined && row.status !== status)
          throw new Error(`Divergent Task.status for ${row.id}`);
        if (row.automationState !== undefined && row.automationState !== automation)
          throw new Error(`Divergent Task.automationState for ${row.id}`);
        if (row.sprintId !== null && !activeSprints.has(row.sprintId))
          throw new Error(`Task ${row.id} retains an inactive sprint; repair the source first`);
      }
      for (const key of Object.keys(row))
        if (!(key in fields) && !(name === "Task" && ["status", "automationState"].includes(key)))
          throw new Error(`Unexpected field ${name}.${key}`);
      const values = columns.map((key) => {
        const field = fields[key];
        const value = row[key];
        if (value === undefined || (value === null && !field.nullable))
          throw new Error(`Missing required ${name}.${key}`);
        if (value === null) return "NULL";
        if (field.kind === "date") {
          if (typeof value !== "string" || !/(?:Z|[+-]\d\d:\d\d)$/.test(value))
            throw new Error(`Expected a zoned timestamp for ${name}.${key}`);
          const millis = Date.parse(value);
          if (!Number.isFinite(millis)) throw new Error(`Invalid timestamp ${name}.${key}`);
          return literal(millis);
        }
        if (field.kind === "boolean") {
          if (typeof value !== "boolean") throw new Error(`Invalid boolean ${name}.${key}`);
          return value ? "1" : "0";
        }
        if (field.kind === "array") {
          if (!Array.isArray(value) || !value.every((item) => typeof item === "string"))
            throw new Error(`Invalid array ${name}.${key}`);
          return literal(JSON.stringify(value));
        }
        if (field.kind === "json") return literal(JSON.stringify(value));
        if (field.kind === "number" && (typeof value !== "number" || !Number.isFinite(value)))
          throw new Error(`Invalid number ${name}.${key}`);
        if (field.kind === "string" && typeof value !== "string")
          throw new Error(`Invalid string ${name}.${key}`);
        return literal(value);
      });
      const statement = `INSERT INTO ${quote(name)} (${columns.map(quote).join(",")}) VALUES (${values.join(",")});`;
      if (new TextEncoder().encode(statement).length > 100_000)
        throw new Error(`Row ${name}.${row.id ?? ""} exceeds D1 SQL import statement limits`);
      statements.push(statement);
    }
  }
  // Verify both referential integrity and every row count before D1 commits the file.
  // A binding.batch is atomic. For large CLI imports, rehearse against an empty isolated DB;
  // a failed import target must not be used for cutover. Do not add unsupported BEGIN/COMMIT.
  const guard = "_ImportGuard";
  const prefix = [
    "PRAGMA defer_foreign_keys = ON;",
    `CREATE TABLE ${quote(guard)} (valid INTEGER NOT NULL CHECK(valid=1));`,
    `INSERT INTO ${quote(guard)} VALUES (${tableNames.map((name) => `(SELECT COUNT(*) FROM ${quote(name)}) = 0`).join(" AND ")});`,
  ];
  const checks = tableNames.map(
    (name) => `(SELECT COUNT(*) FROM ${quote(name)}) = ${counts[name]}`,
  );
  const suffix = [
    `INSERT INTO ${quote(guard)} VALUES (NOT EXISTS(SELECT 1 FROM pragma_foreign_key_check) AND ${checks.join(" AND ")});`,
    `DROP TABLE ${quote(guard)};`,
    "PRAGMA defer_foreign_keys = OFF;",
  ];
  return { statements: [...prefix, ...statements, ...suffix], counts };
}
