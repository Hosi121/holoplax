import { NextResponse } from "next/server";
import { AuthError, requireAuth } from "../../../../lib/api-auth";
import prisma from "../../../../lib/prisma";
import { adoptOrphanAiSuggestions } from "../../../../lib/user-data";

export async function GET() {
  try {
    const { userId, role } = await requireAuth();
    if (role === "ADMIN") {
      const logs = await prisma.aiSuggestion.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
      });
      return NextResponse.json({ logs });
    }
    await adoptOrphanAiSuggestions(userId);
    const logs = await prisma.aiSuggestion.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    return NextResponse.json({ logs });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    console.error("GET /api/ai/logs error", error);
    return NextResponse.json({ error: "failed to load logs" }, { status: 500 });
  }
}
