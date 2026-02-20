import { requireAuth } from "../../../../lib/api-auth";
import { withApiHandler } from "../../../../lib/api-handler";
import { ok } from "../../../../lib/api-response";
import { logAudit } from "../../../../lib/audit";
import { IntakeMemoSchema } from "../../../../lib/contracts/intake";
import { createDomainErrors } from "../../../../lib/http/errors";
import { parseBody } from "../../../../lib/http/validation";
import { deriveIntakeTitle, findDuplicateTasks } from "../../../../lib/intake-helpers";
import prisma from "../../../../lib/prisma";
import { resolveWorkspaceId } from "../../../../lib/workspace-context";

const errors = createDomainErrors("INTAKE");

export async function POST(request: Request) {
  return withApiHandler(
    {
      logLabel: "POST /api/intake/memo",
      errorFallback: {
        code: "INTAKE_INTERNAL",
        message: "failed to create intake item",
        status: 500,
      },
    },
    async () => {
      const { userId } = await requireAuth();
      const body = await parseBody(request, IntakeMemoSchema, { code: "INTAKE_VALIDATION" });
      const text = body.text;
      const requestedWorkspaceId = body.workspaceId ?? null;

      let workspaceId = requestedWorkspaceId;
      if (workspaceId) {
        const membership = await prisma.workspaceMember.findUnique({
          where: { workspaceId_userId: { workspaceId, userId } },
          select: { workspaceId: true },
        });
        if (!membership) {
          return errors.badRequest("invalid workspaceId");
        }
      } else {
        // fallback for memo capture if caller wants current workspace
        const resolved = await resolveWorkspaceId(userId);
        if (body.assignToCurrentWorkspace && resolved) {
          workspaceId = resolved;
        }
      }

      const title = deriveIntakeTitle(text);
      const item = await prisma.intakeItem.create({
        data: {
          source: "MEMO",
          status: "PENDING",
          title,
          body: text,
          user: { connect: { id: userId } },
          workspace: workspaceId ? { connect: { id: workspaceId } } : undefined,
        },
      });

      const duplicates = workspaceId ? await findDuplicateTasks({ workspaceId, title }) : [];

      await logAudit({
        actorId: userId,
        action: "INTAKE_MEMO_CREATE",
        targetWorkspaceId: workspaceId ?? undefined,
        metadata: { itemId: item.id },
      });
      return ok({ item, duplicates });
    },
  );
}
