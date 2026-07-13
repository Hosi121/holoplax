import { readFileSync, readdirSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const toPosix = (value) => value.replaceAll("\\", "/");

const walk = (directory) =>
  readdirSync(directory).flatMap((entry) => {
    const path = resolve(directory, entry);
    if (["node_modules", ".next", "dist", "coverage"].includes(entry)) return [];
    return statSync(path).isDirectory() ? walk(path) : [path];
  });

const sourceFiles = walk(root).filter((path) => /\.(?:ts|tsx)$/.test(path));
const violations = [];
const report = (file, message) => violations.push(`${toPosix(relative(root, file))}: ${message}`);

const importTargets = (source) =>
  [...source.matchAll(/\bfrom\s+["']([^"']+)["']/g)].map((match) => match[1]);

for (const file of sourceFiles) {
  const path = toPosix(relative(root, file));
  const imports = importTargets(readFileSync(file, "utf8"));
  if (/^modules\/[^/]+\/domain\//.test(path) && !/\.test\.ts$/.test(path)) {
    for (const target of imports) {
      if (
        target === "@prisma/client" ||
        target.startsWith("next/") ||
        target.includes("/lib/") ||
        target.includes("/application/") ||
        target.includes("/infrastructure/") ||
        target.includes("index.server")
      ) {
        report(file, `domain layer cannot import ${target}`);
      }
    }
  }
  if (/^modules\/[^/]+\/application\//.test(path)) {
    for (const target of imports) {
      if (
        target === "@prisma/client" ||
        target.startsWith("next/") ||
        target.includes("/lib/") ||
        target.includes("/infrastructure/") ||
        target.includes("index.server")
      ) {
        report(file, `application layer cannot import ${target}`);
      }
    }
  }
  if (/^modules\/[^/]+\/infrastructure\//.test(path)) {
    for (const target of imports) {
      if (target.endsWith("/lib/http/errors")) {
        report(file, `infrastructure layer cannot depend on HTTP presentation via ${target}`);
      }
    }
  }
  if ((path.startsWith("app/") || path.startsWith("mcp-server/src/")) && imports.some(
    (target) => /modules\/[^/]+\/(?:application|domain|infrastructure)\//.test(target),
  )) {
    report(file, "adapter must import a module through index.server only");
  }
}

for (const file of sourceFiles) {
  const path = toPosix(relative(root, file));
  if (!path.startsWith("app/") && !path.startsWith("mcp-server/src/")) continue;
  if (path.startsWith("mcp-server/src/infrastructure/")) continue;
  const imports = importTargets(readFileSync(file, "utf8"));
  if (imports.includes("@prisma/client")) {
    report(file, "driving adapter cannot depend on persistence model types");
  }
  if (imports.some((target) => /(?:^@\/lib\/prisma$|(?:^|\/)lib\/prisma$)/.test(target))) {
    report(file, "driving adapter cannot access Prisma directly");
  }
}

const protectedAdapters = [
  "app/api/tasks/",
  "app/api/ai/apply/",
  "app/api/automation/approval/",
  "app/api/onboarding/",
  "app/api/intake/",
  "app/api/workspaces/",
  "app/api/health/",
  "app/api/velocity/",
  "app/api/integrations/discord/",
  "app/api/mcp/",
  "app/api/account/",
  "app/api/auth/",
  "app/api/ai/",
  "app/api/memory/",
  "app/api/admin/",
];
for (const file of sourceFiles) {
  const path = toPosix(relative(root, file));
  if (!protectedAdapters.some((prefix) => path.startsWith(prefix))) continue;
  const imports = importTargets(readFileSync(file, "utf8"));
  for (const target of imports) {
    if (
      target === "@prisma/client" ||
      /(?:^|\/)lib\/prisma$/.test(target) ||
      /modules\/[^/]+\/(?:application|domain|infrastructure)\//.test(target)
    ) {
      report(file, `migrated adapter cannot bypass its module via ${target}`);
    }
  }
}

if (violations.length) {
  console.error(`Architecture check failed:\n${violations.map((item) => `- ${item}`).join("\n")}`);
  process.exit(1);
}

console.log("Architecture boundaries are valid.");
