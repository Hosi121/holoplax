import { requireAuth } from "../../../../lib/api-auth";
import {
  badRequest,
  handleAuthError,
  ok,
  serverError,
} from "../../../../lib/api-response";
import prisma from "../../../../lib/prisma";
import { findDuplicateTasks } from "../../../../lib/intake-helpers";

export async function POST(request: Request) {
  try {
    const { userId } = await requireAuth();
    const body = await request.json();
    const intakeId = String(body.intakeId ?? "");
    const workspaceId = String(body.workspaceId ?? "");
    if (!intakeId || !workspaceId) {
      return badRequest("intakeId and workspaceId are required");
    }

    const membership = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { workspaceId: true },
    });
    if (!membership) {
      return badRequest("invalid workspaceId");
    }

    const intakeItem = await prisma.intakeItem.findFirst({
      where: { id: intakeId },
      select: { id: true, title: true, userId: true, workspaceId: true },
    });
    if (!intakeItem) {
      return badRequest("invalid intakeId");
    }
    if (intakeItem.userId !== userId && intakeItem.workspaceId !== workspaceId) {
      return badRequest("not allowed");
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
    return serverError("failed to analyze intake item");
  }
}
