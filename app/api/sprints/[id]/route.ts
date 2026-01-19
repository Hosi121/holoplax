import { withApiHandler } from "../../../../lib/api-handler";
import { requireWorkspaceAuth } from "../../../../lib/api-guards";
import { ok } from "../../../../lib/api-response";
import { logAudit } from "../../../../lib/audit";
import { SprintUpdateSchema } from "../../../../lib/contracts/sprint";
import { createDomainErrors } from "../../../../lib/http/errors";
import { parseBody } from "../../../../lib/http/validation";
import prisma from "../../../../lib/prisma";

const errors = createDomainErrors("SPRINT");

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return withApiHandler(
    {
      logLabel: "PATCH /api/sprints/[id]",
      errorFallback: {
        code: "SPRINT_INTERNAL",
        message: "failed to update sprint",
        status: 500,
      },
    },
    async () => {
      const { userId, workspaceId } = await requireWorkspaceAuth({
        domain: "SPRINT",
        requireWorkspace: true,
      });
      if (!workspaceId) return errors.unauthorized("userID is required");
      const { id } = await params;
      const body = await parseBody(request, SprintUpdateSchema, {
        code: "SPRINT_VALIDATION",
      });
      const data: Record<string, unknown> = {};
      if (body.name !== undefined) {
        const name = String(body.name ?? "").trim();
        if (!name) return errors.badRequest("name is required");
        data.name = name;
      }
      if (body.capacityPoints !== undefined) {
        const capacity = Number(body.capacityPoints);
        if (!Number.isFinite(capacity) || capacity <= 0) {
          return errors.badRequest("capacityPoints must be positive");
        }
        data.capacityPoints = capacity;
      }
      if (body.startedAt !== undefined) {
        data.startedAt = body.startedAt ? new Date(body.startedAt) : undefined;
      }
      if (body.plannedEndAt !== undefined) {
        data.plannedEndAt = body.plannedEndAt ? new Date(body.plannedEndAt) : null;
      }

      const updated = await prisma.sprint.updateMany({
        where: { id, workspaceId },
        data,
      });
      if (!updated.count) {
        return errors.notFound("sprint not found");
      }
      const sprint = await prisma.sprint.findFirst({ where: { id, workspaceId } });
      await logAudit({
        actorId: userId,
        action: "SPRINT_UPDATE",
        targetWorkspaceId: workspaceId,
        metadata: { sprintId: id },
      });
      return ok({ sprint });
    },
  );
}
