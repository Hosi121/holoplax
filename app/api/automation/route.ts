import { NextResponse } from "next/server";
import { AuthError, requireAuth } from "../../../lib/api-auth";
import prisma from "../../../lib/prisma";

export async function GET() {
  try {
    const { userId } = await requireAuth();
    const current =
      (await prisma.userAutomationSetting.findFirst({
        where: { userId },
      })) ??
      (await prisma.userAutomationSetting.create({
        data: { low: 35, high: 70, userId },
      }));
    return NextResponse.json({ low: current.low, high: current.high });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    throw error;
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await requireAuth();
    const body = await request.json();
    const low = Number(body.low);
    const high = Number(body.high);
    if (!Number.isFinite(low) || !Number.isFinite(high)) {
      return NextResponse.json({ error: "low/high are required" }, { status: 400 });
    }
    const existing = await prisma.userAutomationSetting.findFirst({
      where: { userId },
    });
    const saved = existing
      ? await prisma.userAutomationSetting.update({
          where: { id: existing.id },
          data: { low, high },
        })
      : await prisma.userAutomationSetting.create({
          data: { low, high, userId },
        });
    return NextResponse.json({ low: saved.low, high: saved.high });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    throw error;
  }
}
