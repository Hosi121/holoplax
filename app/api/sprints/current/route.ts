import { requireAuth } from "../../../../lib/api-auth";
import {
  badRequest,
  handleAuthError,
  notFound,
  ok,
  serverError,
} from "../../../../lib/api-response";
import prisma from "../../../../lib/prisma";
import { resolveWorkspaceId } from "../../../../lib/workspace-context";

const defaultSprintName = () => {
  const today = new Date().toISOString().slice(0, 10);
  return `Sprint-${today}`;
};

export async function GET() {
  try {
    const { userId } = await requireAuth();
    const workspaceId = await resolveWorkspaceId(userId);
    if (!workspaceId) {
      return ok({ sprint: null });
    }
    const sprint = await prisma.sprint.findFirst({
      where: { workspaceId, status: "ACTIVE" },
      orderBy: { startedAt: "desc" },
      select: {
        id: true,
        name: true,
        status: true,
        capacityPoints: true,
        startedAt: true,
        endedAt: true,
      },
    });
    return ok({ sprint });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    console.error("GET /api/sprints/current error", error);
    return serverError("failed to load sprint");
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await requireAuth();
    const workspaceId = await resolveWorkspaceId(userId);
    if (!workspaceId) {
      return badRequest("workspace is required");
    }
    const body = await request.json().catch(() => ({}));
    const name = String(body.name ?? "").trim() || defaultSprintName();
    const capacityPoints = Number(body.capacityPoints ?? 24);
    if (!Number.isFinite(capacityPoints) || capacityPoints <= 0) {
      return badRequest("capacityPoints must be positive");
    }

    const sprint = await prisma.$transaction(async (tx) => {
      await tx.sprint.updateMany({
        where: { workspaceId, status: "ACTIVE" },
        data: { status: "CLOSED", endedAt: new Date() },
      });
      const created = await tx.sprint.create({
        data: {
          name,
          capacityPoints,
          userId,
          workspaceId,
        },
        select: {
          id: true,
          name: true,
          status: true,
          capacityPoints: true,
          startedAt: true,
          endedAt: true,
        },
      });
      await tx.task.updateMany({
        where: { workspaceId, status: "SPRINT" },
        data: { sprintId: created.id },
      });
      return created;
    });

    return ok({ sprint });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    console.error("POST /api/sprints/current error", error);
    return serverError("failed to start sprint");
  }
}

export async function PATCH() {
  try {
    const { userId } = await requireAuth();
    const workspaceId = await resolveWorkspaceId(userId);
    if (!workspaceId) {
      return badRequest("workspace is required");
    }
    const sprint = await prisma.sprint.findFirst({
      where: { workspaceId, status: "ACTIVE" },
      orderBy: { startedAt: "desc" },
      select: { id: true },
    });
    if (!sprint) {
      return notFound("active sprint not found");
    }
    const closed = await prisma.$transaction(async (tx) => {
      const updated = await tx.sprint.update({
        where: { id: sprint.id },
        data: { status: "CLOSED", endedAt: new Date() },
        select: {
          id: true,
          name: true,
          status: true,
          capacityPoints: true,
          startedAt: true,
          endedAt: true,
        },
      });
      await tx.task.updateMany({
        where: { workspaceId, status: "SPRINT" },
        data: { status: "BACKLOG", sprintId: null },
      });
      return updated;
    });

    return ok({ sprint: closed });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    console.error("PATCH /api/sprints/current error", error);
    return serverError("failed to end sprint");
  }
}
