import { NextResponse } from "next/server";
import { AuthError, requireAuth } from "../../../lib/api-auth";
import prisma from "../../../lib/prisma";

export async function GET() {
  try {
    const { userId } = await requireAuth();
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, image: true },
    });
    return NextResponse.json({ user });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    console.error("GET /api/account error", error);
    return NextResponse.json({ error: "failed to load account" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { userId } = await requireAuth();
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").toLowerCase().trim();
    const image = String(body.image ?? "").trim();

    if (email) {
      const existing = await prisma.user.findFirst({
        where: { email, NOT: { id: userId } },
      });
      if (existing) {
        return NextResponse.json({ error: "email already in use" }, { status: 409 });
      }
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        name: name || null,
        email: email || null,
        image: image || null,
      },
      select: { id: true, name: true, email: true, image: true },
    });
    return NextResponse.json({ user: updated });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    console.error("PATCH /api/account error", error);
    return NextResponse.json({ error: "failed to update account" }, { status: 500 });
  }
}
