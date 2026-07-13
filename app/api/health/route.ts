import { NextResponse } from "next/server";
import prisma from "../../../lib/prisma";

export const dynamic = "force-dynamic";

type HealthStatus = {
  status: "healthy" | "unhealthy";
  database: "reachable" | "unreachable";
  timestamp: string;
  version: string;
};

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const health: HealthStatus = {
      status: "healthy",
      database: "reachable",
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? "unknown",
    };
    return NextResponse.json(health, { status: 200 });
  } catch {
    const health: HealthStatus = {
      status: "unhealthy",
      database: "unreachable",
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? "unknown",
    };
    return NextResponse.json(health, { status: 503 });
  }
}
