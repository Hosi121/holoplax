import { NextResponse } from "next/server";
import { isDatabaseReachable } from "../../../modules/system/index.server";

export const dynamic = "force-dynamic";

type HealthStatus = {
  status: "healthy" | "unhealthy";
  database: "reachable" | "unreachable";
  timestamp: string;
  version: string;
};

export async function GET() {
  const reachable = await isDatabaseReachable();
  const health: HealthStatus = {
    status: reachable ? "healthy" : "unhealthy",
    database: reachable ? "reachable" : "unreachable",
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? "unknown",
  };
  return NextResponse.json(health, { status: reachable ? 200 : 503 });
}
