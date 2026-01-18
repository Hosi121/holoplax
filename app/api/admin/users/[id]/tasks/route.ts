import { withApiHandler } from "../../../../../../lib/api-handler";
import { requireAdmin } from "../../../../../../lib/api-guards";
import { ok } from "../../../../../../lib/api-response";
import prisma from "../../../../../../lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withApiHandler(
    {
      logLabel: "GET /api/admin/users/[id]/tasks",
      errorFallback: {
        code: "ADMIN_INTERNAL",
        message: "failed to load tasks",
        status: 500,
      },
    },
    async () => {
      await requireAdmin("ADMIN");
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
    },
  );
}
