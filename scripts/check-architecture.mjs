import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

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

const moduleName = (path) => path.match(/^modules\/([^/]+)\//)?.[1] ?? null;
const resolveImportPath = (file, target) => {
  if (target.startsWith(".")) return toPosix(relative(root, resolve(dirname(file), target)));
  if (target.startsWith("@/")) return target.slice(2);
  return null;
};

const moduleEdges = new Map();

for (const file of sourceFiles) {
  const path = toPosix(relative(root, file));
  const source = readFileSync(file, "utf8");
  const imports = importTargets(source);
  const sourceModule = moduleName(path);
  if (sourceModule && !/\.(?:test|spec)\.[jt]sx?$/.test(path)) {
    for (const target of imports) {
      const targetPath = resolveImportPath(file, target);
      if (!targetPath) continue;
      const targetModule = moduleName(targetPath);
      if (!targetModule || targetModule === sourceModule || targetModule === "shared") continue;
      const edges = moduleEdges.get(sourceModule) ?? new Set();
      edges.add(targetModule);
      moduleEdges.set(sourceModule, edges);
      if (/^modules\/[^/]+\/(?:application|domain|infrastructure)\//.test(targetPath)) {
        report(
          file,
          `cross-module dependency must use ${targetModule}/index or ${targetModule}/index.server, not ${target}`,
        );
      }
    }
  }
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

  // Task is the aggregate owner for general writes. The one shared adapter is
  // deliberately narrow: it contains only cross-aggregate projections that
  // must participate in another module's transaction.
  const ownsTaskWrites =
    path.startsWith("modules/tasks/infrastructure/") ||
    path === "modules/shared/infrastructure/prisma-task-consistency.ts" ||
    path.startsWith("scripts/") ||
    /\.(?:test|spec)\.[jt]sx?$/.test(path);
  if (!ownsTaskWrites) {
    const prismaTaskMutation =
      /\b(?:prisma|tx|db)\.task\.(?:create|createMany|update|updateMany|delete|deleteMany|upsert)\s*\(/;
    const rawTaskMutation = /\b(?:UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s+"Task"/i;
    if (prismaTaskMutation.test(source) || rawTaskMutation.test(source)) {
      report(file, "Task writes must use the tasks module or the shared consistency adapter");
    }
  }

  // Lifecycle history is a permanent audit projection. Requiring every write
  // to pass through one adapter prevents individual commands from omitting
  // immutable task snapshots or inventing a different event shape.
  const ownsTaskStatusEventWrites =
    path === "modules/shared/infrastructure/prisma-task-status-events.ts" ||
    path.startsWith("scripts/") ||
    /\.(?:test|spec)\.[jt]sx?$/.test(path);
  if (
    !ownsTaskStatusEventWrites &&
    /\b(?:prisma|tx|db)\.taskStatusEvent\.(?:create|createMany|update|updateMany|delete|deleteMany|upsert)\s*\(/.test(
      source,
    )
  ) {
    report(file, "Task status events must use the shared status-event adapter");
  }

  // Dependency decisions are part of the Task aggregate. Keeping their state
  // and event updates in one writer makes waiver/reactivation atomic.
  const ownsTaskDependencyWrites =
    path === "modules/tasks/infrastructure/prisma-task-write.ts" ||
    path.startsWith("scripts/") ||
    /\.(?:test|spec)\.[jt]sx?$/.test(path);
  if (
    !ownsTaskDependencyWrites &&
    /\b(?:prisma|tx|db)\.taskDependency\.(?:create|createMany|update|updateMany|delete|deleteMany|upsert)\s*\(/.test(
      source,
    )
  ) {
    report(file, "Task dependency writes must use the Task aggregate writer");
  }

  // A single retry policy is the process-wide unit-of-work boundary. Direct
  // declarations would silently reintroduce inconsistent conflict handling.
  const ownsSerializableTransactions =
    path === "modules/shared/infrastructure/prisma-serializable-transaction.ts" ||
    /\.(?:test|spec)\.[jt]sx?$/.test(path);
  if (!ownsSerializableTransactions && /isolationLevel\s*:\s*["']Serializable["']/.test(source)) {
    report(file, "Serializable transactions must use the shared retrying transaction adapter");
  }

  // Bulk lifecycle decisions belong to the application execution planner. A
  // persistence adapter writing request values directly would recreate the
  // split-brain status/workflow bug even if it called the planner for validation.
  if (path === "modules/tasks/infrastructure/prisma-bulk-task-command.ts") {
    if (/status\s*:\s*command\.status/.test(source)) {
      report(file, "bulk persistence must write lifecycle values from the application plan");
    }
    if (!/planners\.planStatus\s*\(/.test(source)) {
      report(file, "bulk persistence must execute the application lifecycle plan");
    }
    if (/application\/task-lifecycle/.test(source)) {
      report(file, "bulk persistence must not call the lifecycle domain planner directly");
    }
  }
}

const visitingModules = new Set();
const visitedModules = new Set();
const moduleStack = [];
const visitModule = (name) => {
  if (visitingModules.has(name)) {
    const start = moduleStack.indexOf(name);
    const cycle = [...moduleStack.slice(start), name];
    violations.push(`module dependency cycle: ${cycle.join(" -> ")}`);
    return;
  }
  if (visitedModules.has(name)) return;
  visitingModules.add(name);
  moduleStack.push(name);
  for (const dependency of moduleEdges.get(name) ?? []) visitModule(dependency);
  moduleStack.pop();
  visitingModules.delete(name);
  visitedModules.add(name);
};
for (const name of moduleEdges.keys()) visitModule(name);

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
  "app/api/delegations/",
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
