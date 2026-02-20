/**
 * Shared PrismaClient singleton for the MCP server.
 *
 * Previously every service module (auth, tasks, intake, sprints, ai) called
 * `new PrismaClient()` at module load time, opening **5 separate connection
 * pools** to the database.  This file provides a single shared instance so
 * the MCP server process uses exactly one pool.
 *
 * Unlike the Next.js app (which needs the `globalThis` guard to survive hot
 * reloads in development), the MCP server is a plain Node.js process with a
 * stable module registry, so a simple module-level singleton is sufficient.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "production" ? ["error", "warn"] : ["error"],
});

export default prisma;
