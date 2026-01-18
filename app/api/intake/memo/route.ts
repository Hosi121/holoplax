import { requireAuth } from "../../../../lib/api-auth";
import { handleAuthError, ok } from "../../../../lib/api-response";
import prisma from "../../../../lib/prisma";
import { resolveWorkspaceId } from "../../../../lib/workspace-context";
import { deriveIntakeTitle, findDuplicateTasks } from "../../../../lib/intake-helpers";
import { IntakeMemoSchema } from "../../../../lib/contracts/intake";
import { createDomainErrors, errorResponse } from "../../../../lib/http/errors";
import { parseBody } from "../../../../lib/http/validation";

const errors = createDomainErrors("INTAKE");

export async function POST(request: Request) {
  try {
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

    const duplicates = workspaceId
      ? await findDuplicateTasks({ workspaceId, title })
      : [];

    return ok({ item, duplicates });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    console.error("POST /api/intake/memo error", error);
    return errorResponse(error, {
      code: "INTAKE_INTERNAL",
      message: "failed to create intake item",
      status: 500,
    });
  }
}
