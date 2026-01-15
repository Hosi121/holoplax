import { NextResponse } from "next/server";
import { AuthError, requireAuth } from "../../../../lib/api-auth";
import prisma from "../../../../lib/prisma";
import { TASK_STATUS } from "../../../../lib/types";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await request.json();
  const data: Record<string, unknown> = {};

  if (body.title) data.title = body.title;
  if (typeof body.description === "string") data.description = body.description;
  if (body.points) data.points = Number(body.points);
  if (body.urgency) data.urgency = body.urgency;
  if (body.risk) data.risk = body.risk;
  if (body.status && Object.values(TASK_STATUS).includes(body.status)) {
    data.status = body.status;
  }

  try {
    const { userId, role } = await requireAuth();
    if (role === "ADMIN") {
      const updated = await prisma.task.update({
        where: { id },
        data,
      });
      return NextResponse.json({ task: updated });
    }
    const updated = await prisma.task.updateMany({
      where: { id, userId },
      data,
    });
    if (!updated.count) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    const task = await prisma.task.findFirst({
      where: { id, userId },
    });
    return NextResponse.json({ task });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    console.error("PATCH /api/tasks/[id] error", error);
    return NextResponse.json({ error: "not found or update failed" }, { status: 404 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const { userId, role } = await requireAuth();
    if (role === "ADMIN") {
      await prisma.aiSuggestion.deleteMany({ where: { taskId: id } });
      await prisma.task.delete({ where: { id } });
      return NextResponse.json({ ok: true });
    }
    await prisma.aiSuggestion.deleteMany({ where: { taskId: id, userId } });
    const deleted = await prisma.task.deleteMany({ where: { id, userId } });
    if (!deleted.count) {
      return NextResponse.json({ error: "not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
    console.error("DELETE /api/tasks/[id] error", error);
    return NextResponse.json({ error: "not found or delete failed" }, { status: 404 });
  }
}
