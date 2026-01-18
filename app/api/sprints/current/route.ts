import { requireAuth } from "../../../../lib/api-auth";
import {
  badRequest,
  handleAuthError,
  notFound,
  ok,
  serverError,
} from "../../../../lib/api-response";
import { logAudit } from "../../../../lib/audit";
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
        plannedEndAt: true,
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
    const plannedEndAt = body.plannedEndAt ? new Date(body.plannedEndAt) : null;
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
          plannedEndAt,
        },
        select: {
          id: true,
          name: true,
          status: true,
          capacityPoints: true,
          startedAt: true,
          plannedEndAt: true,
          endedAt: true,
        },
      });
      await tx.task.updateMany({
        where: { workspaceId, status: "SPRINT" },
        data: { sprintId: created.id },
      });
      return created;
    });

    await logAudit({
      actorId: userId,
      action: "SPRINT_START",
      targetWorkspaceId: workspaceId,
      metadata: { sprintId: sprint.id, name: sprint.name },
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
          plannedEndAt: true,
          endedAt: true,
        },
      });
      const doneTasks = await tx.task.findMany({
        where: { sprintId: sprint.id, status: "DONE" },
        select: { points: true },
      });
      const completedPoints = doneTasks.reduce((sum, task) => sum + task.points, 0);
      const rangeMin = Math.max(0, completedPoints - 2);
      const rangeMax = completedPoints + 2;
      await tx.velocityEntry.create({
        data: {
          name: updated.name,
          points: completedPoints,
          range: `${rangeMin}-${rangeMax}`,
          userId,
          workspaceId,
        },
      });
      const sprintTasks = await tx.task.findMany({
        where: { workspaceId, status: "SPRINT" },
        select: { id: true },
      });
      await tx.task.updateMany({
        where: { workspaceId, status: "SPRINT" },
        data: { status: "BACKLOG", sprintId: null },
      });
      if (sprintTasks.length) {
        await tx.taskStatusEvent.createMany({
          data: sprintTasks.map((task) => ({
            taskId: task.id,
            fromStatus: "SPRINT",
            toStatus: "BACKLOG",
            actorId: userId,
            source: "SPRINT_END",
            workspaceId,
          })),
        });
      }
      return { updated, completedPoints, rangeMin, rangeMax };
    });

    await logAudit({
      actorId: userId,
      action: "SPRINT_END",
      targetWorkspaceId: workspaceId,
      metadata: { sprintId: closed.updated.id, completedPoints: closed.completedPoints },
    });
    await logAudit({
      actorId: userId,
      action: "VELOCITY_AUTO_CREATE",
      targetWorkspaceId: workspaceId,
      metadata: {
        sprintId: closed.updated.id,
        points: closed.completedPoints,
        range: `${closed.rangeMin}-${closed.rangeMax}`,
      },
    });
    return ok({ sprint: closed.updated });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    console.error("PATCH /api/sprints/current error", error);
    return serverError("failed to end sprint");
  }
}
