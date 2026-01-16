import { requireAuth } from "../../../../../../lib/api-auth";
import {
  forbidden,
  handleAuthError,
  ok,
  serverError,
} from "../../../../../../lib/api-response";
import prisma from "../../../../../../lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { role } = await requireAuth();
    if (role !== "ADMIN") {
      return forbidden();
    }
    const { id } = await params;
    const tasks = await prisma.task.findMany({
      where: { userId: id },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        status: true,
        points: true,
        updatedAt: true,
        workspace: { select: { name: true } },
      },
    });

    return ok({
      tasks: tasks.map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        points: task.points,
        updatedAt: task.updatedAt,
        workspaceName: task.workspace?.name ?? null,
      })),
    });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    console.error("GET /api/admin/users/[id]/tasks error", error);
    return serverError("failed to load tasks");
  }
}
