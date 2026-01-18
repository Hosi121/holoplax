import { requireAuth } from "../../../../lib/api-auth";
import { handleAuthError, ok } from "../../../../lib/api-response";
import prisma from "../../../../lib/prisma";
import { findDuplicateTasks } from "../../../../lib/intake-helpers";
import { IntakeAnalyzeSchema } from "../../../../lib/contracts/intake";
import { createDomainErrors, errorResponse } from "../../../../lib/http/errors";
import { parseBody } from "../../../../lib/http/validation";

const errors = createDomainErrors("INTAKE");

export async function POST(request: Request) {
  try {
    const { userId } = await requireAuth();
    const body = await parseBody(request, IntakeAnalyzeSchema, {
      code: "INTAKE_VALIDATION",
    });
    const intakeId = body.intakeId;
    const workspaceId = body.workspaceId;

    const membership = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { workspaceId: true },
    });
    if (!membership) {
      return errors.badRequest("invalid workspaceId");
    }

    const intakeItem = await prisma.intakeItem.findFirst({
      where: { id: intakeId },
      select: { id: true, title: true, userId: true, workspaceId: true },
    });
    if (!intakeItem) {
      return errors.badRequest("invalid intakeId");
    }
    if (intakeItem.userId !== userId && intakeItem.workspaceId !== workspaceId) {
      return errors.badRequest("not allowed");
    }

    const duplicates = await findDuplicateTasks({
      workspaceId,
      title: intakeItem.title,
    });

    return ok({ duplicates });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    console.error("POST /api/intake/analyze error", error);
    return errorResponse(error, {
      code: "INTAKE_INTERNAL",
      message: "failed to analyze intake item",
      status: 500,
    });
  }
}
