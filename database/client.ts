import type { Models, Relations } from "./models";
import { schema } from "./schema";

export type Table = keyof Models;
type RelationTable<K extends Table, R extends keyof Relations[K]> = Relations[K][R] extends {
  table: infer T extends Table;
}
  ? T
  : never;
type RelationResult<K extends Table, R extends keyof Relations[K], A> = Relations[K][R] extends {
  many: true;
}
  ? Result<RelationTable<K, R>, A>[]
  : Relations[K][R] extends { nullable: true }
    ? Result<RelationTable<K, R>, A> | null
    : Result<RelationTable<K, R>, A>;
type Filter<T> =
  | T
  | {
      equals?: T;
      not?: T | Filter<T>;
      in?: T[];
      notIn?: T[];
      lt?: T;
      lte?: T;
      gt?: T;
      gte?: T;
      contains?: string;
      startsWith?: string;
      mode?: "insensitive";
      hasSome?: string[];
    };
export type Where<K extends Table> = { [F in keyof Models[K]]?: Filter<Models[K][F]> } & {
  [R in keyof Relations[K]]?:
    | Where<RelationTable<K, R>>
    | {
        some?: Where<RelationTable<K, R>>;
        none?: Where<RelationTable<K, R>>;
        every?: Where<RelationTable<K, R>>;
      }
    | null;
} & {
  AND?: Where<K> | Where<K>[];
  OR?: Where<K>[];
  NOT?: Where<K> | Where<K>[];
  [compound: string]: unknown;
};
export type Include<K extends Table> = {
  [R in keyof Relations[K]]?: boolean | Query<RelationTable<K, R>>;
} & { _count?: { select: { [R in keyof Relations[K]]?: boolean } } };
type Select<K extends Table> = { [F in keyof Models[K]]?: boolean } & Include<K>;
export type Query<K extends Table> = {
  where?: Where<K>;
  select?: Select<K>;
  include?: Include<K>;
  orderBy?:
    | Partial<Record<keyof Models[K], "asc" | "desc">>
    | Partial<Record<keyof Models[K], "asc" | "desc">>[];
  take?: number;
  skip?: number;
  cursor?: Where<K>;
};
type Selection<K extends Table, S> = {
  [F in keyof S as S[F] extends false | undefined ? never : F]: F extends keyof Models[K]
    ? Models[K][F]
    : F extends keyof Relations[K]
      ? RelationResult<K, F, S[F]>
      : F extends "_count"
        ? S[F] extends { select: infer C }
          ? { [R in keyof C]: number }
          : never
        : never;
};
export type Result<K extends Table, A> = A extends { select: infer S }
  ? Selection<K, S>
  : Models[K] & (A extends { include: infer I } ? Selection<K, I> : Record<never, never>);
type Data<K extends Table> = {
  [F in keyof Models[K]]?:
    | Models[K][F]
    | (Models[K][F] extends number ? { increment: number } : never);
};
type Aggregate<K extends Table> = {
  where?: Where<K>;
  _sum?: Partial<Record<keyof Models[K], boolean>>;
  _avg?: Partial<Record<keyof Models[K], boolean>>;
  _count?: Partial<Record<keyof Models[K] | "_all", boolean>> | true;
};
type Aggregation<A> = (A extends { _avg: infer S }
  ? { _avg: { [F in keyof S]: number | null } }
  : Record<never, never>) &
  (A extends { _sum: infer S }
    ? { _sum: { [F in keyof S]: number | null } }
    : Record<never, never>) &
  (A extends { _count: infer C }
    ? { _count: C extends true ? number : { [F in keyof C]: number } }
    : Record<never, never>);
export interface Delegate<K extends Table> {
  findMany<const A extends Query<K>>(args?: A): Promise<Result<K, A>[]>;
  findFirst<const A extends Query<K>>(args?: A): Promise<Result<K, A> | null>;
  findUnique<const A extends Query<K>>(args: A): Promise<Result<K, A> | null>;
  findUniqueOrThrow<const A extends Query<K>>(args: A): Promise<Result<K, A>>;
  count(args?: { where?: Where<K> }): Promise<number>;
  aggregate<const A extends Aggregate<K>>(args: A): Promise<Aggregation<A>>;
  groupBy<const A extends Aggregate<K> & { by: (keyof Models[K])[] }>(
    args: A,
  ): Promise<(Pick<Models[K], A["by"][number]> & Aggregation<A>)[]>;
  create<const A extends Query<K> & { data: Data<K> }>(args: A): Promise<Result<K, A>>;
  update<const A extends Query<K> & { data: Data<K> }>(args: A): Promise<Result<K, A>>;
  delete<const A extends Query<K>>(args: A): Promise<Result<K, A>>;
  upsert<const A extends Query<K> & { create: Data<K>; update: Data<K> }>(
    args: A,
  ): Promise<Result<K, A>>;
  createMany(args: { data: Data<K>[]; skipDuplicates?: boolean }): Promise<{ count: number }>;
  updateMany(args: { where?: Where<K>; data: Data<K> }): Promise<{ count: number }>;
  deleteMany(args?: { where?: Where<K> }): Promise<{ count: number }>;
}
export type DatabaseClient = { [K in Table as Uncapitalize<K>]: Delegate<K> } & {
  command<T>(
    plan: (db: DatabaseClient) => Promise<T>,
    options?: { maxAttempts?: number },
  ): Promise<T>;
  query<T extends object>(sql: string, values?: unknown[]): Promise<T[]>;
};
export class DatabaseError extends Error {
  constructor(
    public readonly code: "CONFLICT" | "UNIQUE" | "NOT_FOUND" | "CONSTRAINT",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "DatabaseError";
  }
}

// Identifiers come only from the checked, static schema; values are always bound.
type Row = Record<string, unknown>;
type Field = { kind: string; nullable: boolean; default?: unknown; updated?: boolean };
type Relation = {
  table: Table;
  local: readonly string[];
  foreign: readonly string[];
  many: boolean;
  nullable: boolean;
  onDelete?: string;
};
type Definition = {
  fields: Record<string, Field>;
  relations: Record<string, Relation>;
  primary: readonly string[];
  unique: readonly (readonly string[])[];
};
const definitions: Record<Table, Definition> = schema;
const quote = (identifier: string) => `"${identifier.replaceAll('"', '""')}"`;
const keyOf = (table: Table, row: Row) =>
  JSON.stringify(definitions[table].primary.map((key) => row[key]));
const encoded = (field: Field, value: unknown): string | number | null => {
  if (value === null || value === undefined) return null;
  if (field.kind === "date") return new Date(value as string | number | Date).getTime();
  if (field.kind === "boolean") return value ? 1 : 0;
  if (field.kind === "json" || field.kind === "array") return JSON.stringify(value);
  if (typeof value === "string" || typeof value === "number") return value;
  throw new TypeError("Invalid D1 scalar value");
};
const decoded = (table: Table, row: Row): Row =>
  Object.fromEntries(
    Object.entries(row).map(([key, value]) => {
      const field = definitions[table].fields[key];
      return [
        key,
        value === null || !field
          ? value
          : field.kind === "date"
            ? new Date(value as number)
            : field.kind === "boolean"
              ? Boolean(value)
              : field.kind === "json" || field.kind === "array"
                ? JSON.parse(value as string)
                : value,
      ];
    }),
  );
function normalizeError(error: unknown): never {
  if (error instanceof DatabaseError) throw error;
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("command_snapshot_current"))
    throw new DatabaseError("CONFLICT", "Database changed while planning the command", {
      cause: error,
    });
  if (message.includes("UNIQUE constraint failed"))
    throw new DatabaseError("UNIQUE", "Unique database constraint failed", { cause: error });
  if (message.includes("constraint failed"))
    throw new DatabaseError("CONSTRAINT", "Database constraint failed", { cause: error });
  throw error;
}

class Sql {
  values: unknown[] = [];
  tables = new Set<Table>();
  aliasIndex = 0;
  bind(value: unknown) {
    this.values.push(value);
    return "?";
  }
  column(table: Table, key: string, alias: string) {
    if (!definitions[table].fields[key]) throw new TypeError(`Unknown field ${table}.${key}`);
    return `${quote(alias)}.${quote(key)}`;
  }
  where(table: Table, where: Row | undefined, alias: string): string {
    this.tables.add(table);
    const clauses: string[] = [];
    for (const [key, value] of Object.entries(where ?? {})) {
      if (value === undefined) continue;
      if (["AND", "OR", "NOT"].includes(key)) {
        const parts = (Array.isArray(value) ? value : [value]).map(
          (v) => `(${this.where(table, v as Row, alias)})`,
        );
        clauses.push(
          key === "NOT"
            ? parts.map((v) => `NOT ${v}`).join(" AND ") || "1"
            : parts.join(key === "OR" ? " OR " : " AND ") || (key === "OR" ? "0" : "1"),
        );
        continue;
      }
      const rel = definitions[table].relations[key];
      if (rel) {
        const relatedAlias = `r${this.aliasIndex++}`;
        const join = rel.foreign
          .map(
            (f, i) =>
              `${this.column(rel.table, f, relatedAlias)} = ${this.column(table, rel.local[i], alias)}`,
          )
          .join(" AND ");
        if (value === null) {
          this.tables.add(rel.table);
          clauses.push(
            `NOT EXISTS (SELECT 1 FROM ${quote(rel.table)} ${quote(relatedAlias)} WHERE ${join})`,
          );
          continue;
        }
        const filter = value as Row;
        const op =
          "none" in filter
            ? "none"
            : "every" in filter
              ? "every"
              : "some" in filter
                ? "some"
                : null;
        const predicate = this.where(rel.table, op ? (filter[op] as Row) : filter, relatedAlias);
        clauses.push(
          `${op === "none" || op === "every" ? "NOT " : ""}EXISTS (SELECT 1 FROM ${quote(rel.table)} ${quote(relatedAlias)} WHERE ${join} AND ${op === "every" ? "NOT " : ""}(${predicate}))`,
        );
        continue;
      }
      const field = definitions[table].fields[key];
      if (!field) {
        const compound = definitions[table].unique
          .concat([definitions[table].primary])
          .find((cols) => cols.join("_") === key);
        if (!compound || !value || typeof value !== "object")
          throw new TypeError(`Unknown condition ${table}.${key}`);
        clauses.push(this.where(table, value as Row, alias));
        continue;
      }
      const column = this.column(table, key, alias);
      const scalar = (operator: string, v: unknown) =>
        v === null
          ? `${column} IS ${operator === "<>" ? "NOT " : ""}NULL`
          : `${column} ${operator} ${this.bind(encoded(field, v))}`;
      if (
        value === null ||
        value instanceof Date ||
        typeof value !== "object" ||
        Array.isArray(value)
      ) {
        clauses.push(scalar("=", value));
        continue;
      }
      const filter = value as Row;
      for (const [op, v] of Object.entries(filter)) {
        if (v === undefined || op === "mode") continue;
        if (op === "in" || op === "notIn") {
          const items = v as unknown[];
          clauses.push(
            items.length
              ? `${column} ${op === "notIn" ? "NOT " : ""}IN (SELECT value FROM json_each(${this.bind(JSON.stringify(items.map((item) => encoded(field, item))))}))`
              : op === "in"
                ? "0"
                : "1",
          );
        } else if (op === "contains" || op === "startsWith") {
          const insensitive = filter.mode === "insensitive";
          const lhs = insensitive ? `lower(${column})` : column;
          const needle = this.bind(insensitive ? String(v).toLowerCase() : String(v));
          clauses.push(`instr(${lhs}, ${needle}) ${op === "startsWith" ? "= 1" : "> 0"}`);
        } else if (op === "hasSome") {
          const items = v as string[];
          clauses.push(
            items.length
              ? `EXISTS (SELECT 1 FROM json_each(${column}) WHERE value IN (SELECT value FROM json_each(${this.bind(JSON.stringify(items))})))`
              : "0",
          );
        } else if (op === "not" && v !== null && typeof v === "object" && !(v instanceof Date))
          clauses.push(`NOT (${this.where(table, { [key]: v }, alias)})`);
        else {
          const operators: Record<string, string> = {
            equals: "=",
            not: "<>",
            lt: "<",
            lte: "<=",
            gt: ">",
            gte: ">=",
          };
          if (!operators[op]) throw new TypeError(`Unknown operator ${op}`);
          clauses.push(scalar(operators[op], v));
        }
      }
    }
    return clauses.map((v) => `(${v})`).join(" AND ") || "1";
  }
}

type RuntimeQuery = {
  where?: Row;
  select?: Row;
  include?: Row;
  orderBy?: Row | Row[];
  take?: number;
  skip?: number;
  cursor?: Row;
};
type Mutation = RuntimeQuery & { data?: Row; create?: Row; update?: Row; skipDuplicates?: boolean };
type Statement = { sql: string; values: unknown[] };

class Repository {
  readonly overlay = new Map<Table, Map<string, Row | null>>();
  readonly revisions = new Map<Table, number>();
  readonly statements: Statement[] = [];
  readonly client: DatabaseClient;
  // The session pins reads to the primary. A command has no open SQL transaction:
  // writes are staged, reads see staged rows through CTEs, and one guarded batch commits.
  constructor(
    readonly binding: D1Database,
    readonly planning = false,
    readonly session = binding.withSession("first-primary"),
  ) {
    const api: Record<string, unknown> = {
      command: async <T>(
        plan: (db: DatabaseClient) => Promise<T>,
        options?: { maxAttempts?: number },
      ) => {
        if (this.planning) return plan(this.client);
        const attempts = options?.maxAttempts ?? 3;
        for (let attempt = 0; attempt < attempts; attempt++) {
          const command = new Repository(binding, true);
          try {
            const result = await plan(command.client);
            await command.commit();
            return result;
          } catch (error) {
            if (
              error instanceof DatabaseError &&
              error.code === "CONFLICT" &&
              attempt + 1 < attempts
            )
              continue;
            throw error;
          }
        }
        throw new Error("Invalid command attempt limit");
      },
      query: async <T extends object>(sql: string, values: unknown[] = []) => {
        if (this.planning) throw new Error("Raw queries are not allowed inside a command plan");
        return (
          await this.session
            .prepare(sql)
            .bind(...values)
            .all<T>()
        ).results;
      },
    };
    for (const table of Object.keys(definitions) as Table[]) {
      const findMany = (args: RuntimeQuery = {}) => this.find(table, args);
      const findFirst = async (args: RuntimeQuery = {}) =>
        (await this.find(table, { ...args, take: 1 }))[0] ?? null;
      const findOrThrow = async (args: RuntimeQuery = {}) => {
        const row = await findFirst(args);
        if (!row) throw new DatabaseError("NOT_FOUND", `${table} not found`);
        return row;
      };
      api[table[0].toLowerCase() + table.slice(1)] = {
        findMany,
        findFirst,
        findUnique: findFirst,
        findUniqueOrThrow: findOrThrow,
        count: async (args: RuntimeQuery = {}) => {
          const rows = await this.aggregate(table, { ...args, _count: true });
          return rows[0]._count;
        },
        aggregate: async (args: Row) => (await this.aggregate(table, args))[0],
        groupBy: (args: Row) => this.aggregate(table, args),
        create: (args: Mutation) => this.mutate(table, "create", args),
        update: (args: Mutation) => this.mutate(table, "update", args),
        delete: (args: Mutation) => this.mutate(table, "delete", args),
        upsert: (args: Mutation) => this.mutate(table, "upsert", args),
        createMany: async (args: { data: Row[]; skipDuplicates?: boolean }) =>
          this.writeScope(async (client) => {
            let count = 0;
            for (const data of args.data) {
              if (args.skipDuplicates && (await this.existsUnique(table, data))) continue;
              await client.mutate(table, "create", { data });
              count++;
            }
            return { count };
          }),
        updateMany: (args: Mutation) =>
          this.writeScope(async (client) => {
            const rows = await client.find(table, { where: args.where });
            for (const row of rows)
              await client.mutate(table, "update", {
                where: client.primaryWhere(table, row),
                data: args.data,
              });
            return { count: rows.length };
          }),
        deleteMany: (args: Mutation = {}) =>
          this.writeScope(async (client) => {
            const rows = await client.find(table, { where: args.where });
            for (const row of rows)
              await client.mutate(table, "delete", { where: client.primaryWhere(table, row) });
            return { count: rows.length };
          }),
      };
    }
    this.client = api as DatabaseClient;
    repositories.set(this.client, this);
  }
  async writeScope<T>(operation: (repository: Repository) => Promise<T>): Promise<T> {
    if (this.planning) return operation(this);
    return this.client.command((client) => operation(repositories.get(client)!));
  }
  async observe(tables: Set<Table>) {
    const missing = [...tables].filter((table) => !this.revisions.has(table));
    if (!this.planning || !missing.length) return;
    const rows = await this.session
      .prepare(
        `SELECT "tableName", "version" FROM "_Revision" WHERE "tableName" IN (${missing.map(() => "?").join(",")})`,
      )
      .bind(...missing)
      .all<{ tableName: Table; version: number }>();
    for (const row of rows.results) {
      // Parallel reads may observe different versions. Preserve the oldest observation;
      // replacing it with a newer version could hide a mixed snapshot at commit.
      this.revisions.set(
        row.tableName,
        Math.min(this.revisions.get(row.tableName) ?? row.version, row.version),
      );
    }
    if (rows.results.length !== missing.length)
      throw new Error("Missing D1 revision metadata; apply migrations");
  }
  primaryWhere(table: Table, row: Row) {
    return Object.fromEntries(definitions[table].primary.map((key) => [key, row[key]]));
  }
  async existsUnique(table: Table, data: Row) {
    const keys = [definitions[table].primary, ...definitions[table].unique].filter((cols) =>
      cols.every((col) => data[col] != null),
    );
    return (
      keys.length &&
      (
        await this.find(table, {
          where: {
            OR: keys.map((cols) => Object.fromEntries(cols.map((col) => [col, data[col]]))),
          },
          take: 1,
        })
      ).length > 0
    );
  }
  withOverlay(sql: Sql): string {
    const ctes: string[] = [];
    for (const [table, rows] of this.overlay) {
      if (!rows.size) continue;
      const def = definitions[table];
      const fields = Object.keys(def.fields);
      const oldKeys = [...rows.keys()].map((key) => JSON.parse(key) as unknown[]);
      const excluded = sql.bind(JSON.stringify(oldKeys));
      const inserted = [...rows.values()]
        .filter((row): row is Row => row !== null)
        .map((row) => fields.map((field) => encoded(def.fields[field], row[field])));
      const added = sql.bind(JSON.stringify(inserted));
      const matches = def.primary
        .map(
          (field, i) =>
            `main.${quote(table)}.${quote(field)} = json_extract(deleted.value, '$[${i}]')`,
        )
        .join(" AND ");
      ctes.push(
        `${quote(table)} AS (SELECT ${fields.map(quote).join(",")} FROM main.${quote(table)} WHERE NOT EXISTS (SELECT 1 FROM json_each(${excluded}) deleted WHERE ${matches}) UNION ALL SELECT ${fields.map((_, i) => `json_extract(added.value, '$[${i}]')`).join(",")} FROM json_each(${added}) added)`,
      );
    }
    return ctes.length ? `WITH ${ctes.join(",")} ` : "";
  }
  async execute(sql: Sql, body: () => string): Promise<Row[]> {
    // Bind order must follow SQL: overlay CTEs precede the SELECT predicate.
    const prefix = this.withOverlay(sql);
    const query = body();
    await this.observe(sql.tables);
    try {
      return (
        await this.session
          .prepare(prefix + query)
          .bind(...sql.values)
          .all<Row>()
      ).results;
    } catch (error) {
      normalizeError(error);
    }
  }
  async find(table: Table, args: RuntimeQuery): Promise<Row[]> {
    const sql = new Sql();
    const rows = await this.execute(sql, () => {
      let where = sql.where(table, args.where, "t");
      const fields = Object.keys(definitions[table].fields);
      const order = Array.isArray(args.orderBy) ? args.orderBy : args.orderBy ? [args.orderBy] : [];
      if (args.cursor) {
        // Cursor ordering uses the full deterministic order, including ties.
        const cursorPredicate = sql.where(table, args.cursor, "cursor");
        const cursorSelect = `SELECT ${fields.map((f) => sql.column(table, f, "cursor")).join(",")} FROM ${quote(table)} "cursor" WHERE ${cursorPredicate}`;
        const clauses: string[] = [];
        const ordered = order.flatMap((o) => Object.entries(o));
        if (!ordered.length) throw new TypeError("Cursor pagination requires an order");
        // Bind cursor values once by adding a single CTE-equivalent scalar lookup per key.
        // Use tuple comparisons for the common same-direction ordering.
        if (!ordered.every(([, direction]) => direction === ordered[0][1]))
          throw new TypeError("Mixed-direction cursors are unsupported");
        // cursorSelect has binds once; repeat only a derived subquery of its columns.
        clauses.push(
          `(${ordered.map(([f]) => sql.column(table, f, "t")).join(",")}) ${ordered[0][1] === "desc" ? "<=" : ">="} (SELECT ${ordered.map(([f]) => quote(f)).join(",")} FROM (${cursorSelect}))`,
        );
        where += ` AND ${clauses.join(" AND ")}`;
      }
      const orderSql = order
        .flatMap((o) =>
          Object.entries(o).map(
            ([key, direction]) =>
              `${sql.column(table, key, "t")} ${direction === "desc" ? "DESC" : "ASC"}`,
          ),
        )
        .join(",");
      return `SELECT ${fields.map((f) => sql.column(table, f, "t")).join(",")} FROM ${quote(table)} "t" WHERE ${where}${orderSql ? " ORDER BY " + orderSql : ""}${args.take !== undefined ? ` LIMIT ${sql.bind(Math.max(0, Math.trunc(args.take)))}` : args.skip ? " LIMIT -1" : ""}${args.skip ? ` OFFSET ${sql.bind(Math.max(0, Math.trunc(args.skip)))}` : ""}`;
    });
    return this.project(
      table,
      rows.map((row) => decoded(table, row)),
      args,
    );
  }
  async project(table: Table, rows: Row[], args: RuntimeQuery): Promise<Row[]> {
    if (!rows.length) return [];
    const selection = args.select ?? args.include;
    const projected = rows.map((row) =>
      args.select
        ? Object.fromEntries(Object.entries(row).filter(([key]) => args.select![key]))
        : { ...row },
    );
    if (!selection) return projected;
    const countSelection = (selection._count as { select?: Row } | undefined)?.select;
    const requested = Object.entries(selection).filter(
      ([key, value]) => value && definitions[table].relations[key],
    );
    for (const key of Object.keys(countSelection ?? {}))
      if (!requested.some(([name]) => name === key)) requested.push([key, {}]);
    // Fetch each relation once for the complete parent set, instead of per parent.
    for (const [key, requestedArgs] of requested) {
      const rel = definitions[table].relations[key];
      const relatedArgs = requestedArgs === true ? {} : (requestedArgs as RuntimeQuery);
      const localTuples = rows
        .map((row) => rel.local.map((col) => row[col]))
        .filter((values) => values.every((v) => v !== null));
      const uniqueTuples = [
        ...new Map(localTuples.map((values) => [JSON.stringify(values), values])).values(),
      ];
      const linked: Row[] = [];
      // D1 accepts at most 100 bound parameters. Chunk parent keys for large lists.
      for (let i = 0; i < uniqueTuples.length; i += 30) {
        const keys = uniqueTuples.slice(i, i + 30);
        linked.push(
          ...(await this.find(rel.table, {
            where: {
              AND: [
                relatedArgs.where ?? {},
                {
                  OR: keys.map((values) =>
                    Object.fromEntries(rel.foreign.map((col, j) => [col, values[j]])),
                  ),
                },
              ],
            },
            orderBy: relatedArgs.orderBy,
          })),
        );
      }
      const linkedProjected = selection[key]
        ? await this.project(rel.table, linked, relatedArgs)
        : [];
      const projectedByKey = new Map(
        linked.map((row, i) => [keyOf(rel.table, row), linkedProjected[i]]),
      );
      for (let i = 0; i < rows.length; i++) {
        const matching = linked.filter((row) =>
          rel.foreign.every((col, j) => equal(row[col], rows[i][rel.local[j]])),
        );
        if (countSelection?.[key])
          projected[i]._count = { ...(projected[i]._count as Row), [key]: matching.length };
        if (!selection[key]) continue;
        const limited = matching.slice(
          relatedArgs.skip ?? 0,
          relatedArgs.take === undefined ? undefined : (relatedArgs.skip ?? 0) + relatedArgs.take,
        );
        const nested = limited.map((row) => projectedByKey.get(keyOf(rel.table, row))!);
        projected[i][key] = rel.many ? nested : (nested[0] ?? null);
      }
    }
    return projected;
  }
  async aggregate(table: Table, args: Row): Promise<Row[]> {
    const sql = new Sql();
    const by = (args.by ?? []) as string[];
    const sums = Object.keys((args._sum ?? {}) as Row);
    const averages = Object.keys((args._avg ?? {}) as Row);
    const counts = args._count === true ? ["*"] : Object.keys((args._count ?? {}) as Row);
    const rows = await this.execute(sql, () => {
      const where = sql.where(table, args.where as Row, "t");
      const cols = [
        ...by.map((f) => sql.column(table, f, "t")),
        ...sums.map((f) => `SUM(${sql.column(table, f, "t")}) AS ${quote("sum_" + f)}`),
        ...averages.map((f) => `AVG(${sql.column(table, f, "t")}) AS ${quote("avg_" + f)}`),
        ...counts.map(
          (f) =>
            `COUNT(${f === "*" || f === "_all" ? "*" : sql.column(table, f, "t")}) AS ${quote("count_" + f)}`,
        ),
      ];
      return `SELECT ${cols.join(",")} FROM ${quote(table)} "t" WHERE ${where}${by.length ? " GROUP BY " + by.map((f) => sql.column(table, f, "t")).join(",") : ""}`;
    });
    return rows.map((row) => ({
      ...Object.fromEntries(by.map((f) => [f, row[f]])),
      ...(args._avg ? { _avg: Object.fromEntries(averages.map((f) => [f, row["avg_" + f]])) } : {}),
      ...(args._sum ? { _sum: Object.fromEntries(sums.map((f) => [f, row["sum_" + f]])) } : {}),
      ...(args._count
        ? {
            _count:
              args._count === true
                ? row["count_*"]
                : Object.fromEntries(counts.map((f) => [f, row["count_" + f]])),
          }
        : {}),
    }));
  }
  async mutate(table: Table, kind: string, args: Mutation): Promise<Row> {
    if (!this.planning)
      return this.writeScope((repository) => repository.mutate(table, kind, args));
    const def = definitions[table];
    const existing =
      kind === "create"
        ? null
        : ((await this.find(table, { where: args.where, take: 1 }))[0] ?? null);
    if (kind === "upsert" && existing && !Object.keys(args.update ?? {}).length)
      return (await this.project(table, [existing], args))[0];
    if (kind === "upsert")
      return this.mutate(table, existing ? "update" : "create", {
        ...args,
        data: existing ? args.update : args.create,
      });
    if (kind !== "create" && !existing) throw new DatabaseError("NOT_FOUND", `${table} not found`);
    await this.observe(new Set([table]));
    const row: Row = existing ? { ...existing } : {};
    if (kind !== "delete") {
      for (const [field, meta] of Object.entries(def.fields)) {
        const input = args.data?.[field];
        if (input !== undefined)
          row[field] =
            meta.kind === "number" &&
            input !== null &&
            typeof input === "object" &&
            "increment" in input
              ? Number(row[field] ?? 0) + Number(input.increment)
              : input;
        else if (!existing) {
          const value = meta.default;
          row[field] =
            value && typeof value === "object" && "generated" in value
              ? value.generated === "id"
                ? crypto.randomUUID()
                : new Date()
              : value !== undefined
                ? value
                : meta.nullable
                  ? null
                  : meta.updated
                    ? new Date()
                    : undefined;
        }
        if (meta.updated && input === undefined) row[field] = new Date();
        if (row[field] === undefined) throw new TypeError(`Missing required ${table}.${field}`);
      }
      for (const key of Object.keys(args.data ?? {}))
        if (!def.fields[key]) throw new TypeError(`Unknown data field ${table}.${key}`);
    }
    const sql = new Sql();
    let text: string;
    if (kind === "create")
      text = `INSERT INTO ${quote(table)} (${Object.keys(def.fields).map(quote).join(",")}) VALUES (${Object.entries(
        def.fields,
      )
        .map(([field, meta]) => sql.bind(encoded(meta, row[field])))
        .join(",")})`;
    else {
      const assignments =
        kind === "update"
          ? Object.entries(def.fields)
              .map(([field, meta]) => `${quote(field)} = ${sql.bind(encoded(meta, row[field]))}`)
              .join(",")
          : "";
      const where = sql.where(table, this.primaryWhere(table, existing!), table);
      text =
        kind === "delete"
          ? `DELETE FROM ${quote(table)} WHERE ${where}`
          : `UPDATE ${quote(table)} SET ${assignments} WHERE ${where}`;
    }
    this.statements.push({ sql: text, values: sql.values });
    let changes = this.overlay.get(table);
    if (!changes) {
      changes = new Map();
      this.overlay.set(table, changes);
    }
    if (existing && keyOf(table, existing) !== keyOf(table, row))
      changes.set(keyOf(table, existing), null);
    changes.set(keyOf(table, row), kind === "delete" ? null : row);
    if (kind === "delete") await this.stageCascades(table, row);
    return (await this.project(table, [row], args))[0];
  }
  async stageCascades(table: Table, row: Row) {
    for (const [dependent, definition] of Object.entries(definitions) as [Table, Definition][]) {
      for (const relation of Object.values(definition.relations)) {
        if (relation.table !== table || !relation.onDelete || relation.onDelete === "Restrict")
          continue;
        const rows = await this.find(dependent, {
          where: Object.fromEntries(
            relation.local.map((field, i) => [field, row[relation.foreign[i]]]),
          ),
        });
        for (const child of rows) {
          let overlay = this.overlay.get(dependent);
          if (!overlay) {
            overlay = new Map();
            this.overlay.set(dependent, overlay);
          }
          // SQL foreign keys perform the physical change; overlay makes subsequent reads agree.
          if (relation.onDelete === "Cascade") {
            overlay.set(keyOf(dependent, child), null);
            await this.stageCascades(dependent, child);
          } else
            overlay.set(keyOf(dependent, child), {
              ...child,
              ...Object.fromEntries(relation.local.map((f) => [f, null])),
            });
        }
      }
    }
  }
  async commit() {
    if (!this.statements.length) return;
    const id = crypto.randomUUID();
    const values: unknown[] = [id];
    const checks = [...this.revisions].map(([table, version]) => {
      values.push(table, version);
      return '(SELECT "version" FROM "_Revision" WHERE "tableName" = ?) = ?';
    });
    const guard = {
      sql: `INSERT INTO "_CommandGuard" ("id", "valid") VALUES (?, ${checks.join(" AND ") || "1"})`,
      values,
    };
    const cleanup = { sql: 'DELETE FROM "_CommandGuard" WHERE "id" = ?', values: [id] };
    try {
      await this.session.batch(
        [guard, ...this.statements, cleanup].map((s) =>
          this.session.prepare(s.sql).bind(...s.values),
        ),
      );
    } catch (error) {
      normalizeError(error);
    }
  }
}
const equal = (a: unknown, b: unknown) =>
  a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b;
const repositories = new WeakMap<DatabaseClient, Repository>();
export function createDatabase(binding: D1Database): DatabaseClient {
  const repository = new Repository(binding);
  repositories.set(repository.client, repository);
  return repository.client;
}
