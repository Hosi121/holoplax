import { NextResponse } from "next/server";
import { getSystemHealth } from "../../../modules/system/index.server";

export const dynamic = "force-dynamic";

type HealthStatus = {
  status: "healthy" | "degraded" | "unhealthy";
  database: "reachable" | "unreachable";
  automation: {
    pending: number;
    running: number;
    failed: number;
    stalePending: number;
    staleRunning: number;
    oldestPendingAt: string | null;
    oldestRunningAt: string | null;
  };
  timestamp: string;
  version: string;
};

export async function GET() {
  const snapshot = await getSystemHealth();
  const reachable = snapshot.databaseReachable;
  const health: HealthStatus = {
    status: snapshot.status,
    database: reachable ? "reachable" : "unreachable",
    automation: {
      ...snapshot.automation,
      oldestPendingAt: snapshot.automation.oldestPendingAt?.toISOString() ?? null,
      oldestRunningAt: snapshot.automation.oldestRunningAt?.toISOString() ?? null,
    },
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? "unknown",
  };
  return NextResponse.json(health, { status: reachable ? 200 : 503 });
}
