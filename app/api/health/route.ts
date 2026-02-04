import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type HealthStatus = {
  status: "healthy";
  timestamp: string;
  version: string;
};

export async function GET() {
  const health: HealthStatus = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? "unknown",
  };

  return NextResponse.json(health, { status: 200 });
}
