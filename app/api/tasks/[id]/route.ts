import { AuthError, requireAuth } from "../../../../lib/api-auth";
import {
  handleAuthError,
  notFound,
  ok,
  serverError,
} from "../../../../lib/api-response";
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
      return ok({ task: updated });
    }
    const updated = await prisma.task.updateMany({
      where: { id, userId },
      data,
    });
    if (!updated.count) {
      return notFound();
    }
    const task = await prisma.task.findFirst({
      where: { id, userId },
    });
    return ok({ task });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    console.error("PATCH /api/tasks/[id] error", error);
    return notFound("not found or update failed");
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
      return ok({ ok: true });
    }
    await prisma.aiSuggestion.deleteMany({ where: { taskId: id, userId } });
    const deleted = await prisma.task.deleteMany({ where: { id, userId } });
    if (!deleted.count) {
      return notFound();
    }
    return ok({ ok: true });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    console.error("DELETE /api/tasks/[id] error", error);
    return notFound("not found or delete failed");
  }
}
