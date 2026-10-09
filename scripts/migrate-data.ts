import { readFile, writeFile } from "node:fs/promises";
import { convertPostgresExport, postgresExportSql } from "../database/import";

const args = process.argv.slice(2);
if (args.length === 1 && args[0] === "--export-sql") {
  process.stdout.write(postgresExportSql());
} else if (args.length === 4 && args[0] === "--input" && args[2] === "--output") {
  const converted = convertPostgresExport(JSON.parse(await readFile(args[1], "utf8")));
  // Never overwrite a prior export/import artifact. Both files contain private data.
  await writeFile(args[3], `${converted.statements.join("\n")}\n`, { flag: "wx", mode: 0o600 });
  await writeFile(`${args[3]}.counts.json`, `${JSON.stringify(converted.counts, null, 2)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
  console.log(
    `Prepared ${Object.values(converted.counts).reduce((sum, n) => sum + n, 0)} rows; no database was changed.`,
  );
} else {
  throw new Error(
    "Usage: node --import tsx scripts/migrate-data.ts --export-sql | --input export.json --output import.sql",
  );
}
