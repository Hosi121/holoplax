import { NextResponse } from "next/server";
import { AuthError, requireAuth } from "../../../lib/api-auth";
import prisma from "../../../lib/prisma";
import { adoptOrphanVelocity } from "../../../lib/user-data";

export async function GET() {
  try {
    const { userId, role } = await requireAuth();
    if (role === "ADMIN") {
      const velocity = await prisma.velocityEntry.findMany({
        orderBy: { createdAt: "desc" },
      });
      return NextResponse.json({ velocity });
    }
    await adoptOrphanVelocity(userId);
    const velocity = await prisma.velocityEntry.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ velocity });
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
    const { name, points, range } = body;
    if (!name || !points || !range) {
      return NextResponse.json({ error: "name, points, range are required" }, { status: 400 });
    }
    const entry = await prisma.velocityEntry.create({
      data: {
        name,
        points: Number(points),
        range,
        userId,
      },
    });
    return NextResponse.json({ entry });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    throw error;
  }
}
