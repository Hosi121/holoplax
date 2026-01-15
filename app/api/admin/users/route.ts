import { NextResponse } from "next/server";
import { AuthError, requireAuth } from "../../../../lib/api-auth";
import prisma from "../../../../lib/prisma";

export async function GET() {
  try {
    const { role } = await requireAuth();
    if (role !== "ADMIN") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });
    return NextResponse.json({ users });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    console.error("GET /api/admin/users error", error);
    return NextResponse.json({ error: "failed to load users" }, { status: 500 });
  }
}
