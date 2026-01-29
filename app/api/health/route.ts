import { NextResponse } from "next/server";
import prisma from "../../../lib/prisma";

export const dynamic = "force-dynamic";

type HealthStatus = {
  status: "healthy" | "unhealthy";
  timestamp: string;
  version: string;
  checks: {
    database: {
      status: "up" | "down";
      latencyMs?: number;
      error?: string;
    };
  };
};

export async function GET() {
  const startTime = Date.now();
  const health: HealthStatus = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? "unknown",
    checks: {
      database: {
        status: "up",
      },
    },
  };

  try {
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    health.checks.database.latencyMs = Date.now() - dbStart;
  } catch (error) {
    health.status = "unhealthy";
    health.checks.database.status = "down";
    health.checks.database.error =
      error instanceof Error ? error.message : "Unknown database error";
  }

  const statusCode = health.status === "healthy" ? 200 : 503;
  return NextResponse.json(health, { status: statusCode });
}
