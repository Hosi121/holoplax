import { requireAuth } from "../../../../../lib/api-auth";
import {
  badRequest,
  handleAuthError,
  ok,
  serverError,
} from "../../../../../lib/api-response";
import { logAudit } from "../../../../../lib/audit";
import prisma from "../../../../../lib/prisma";
import { resolveWorkspaceId } from "../../../../../lib/workspace-context";

const buildAppendix = (type: string, prepId: string, output: string) =>
  `\n\n---\nAI下準備(${type}:${prepId})\n${output}`;

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const { userId } = await requireAuth();
    const workspaceId = await resolveWorkspaceId(userId);
    if (!workspaceId) {
      return badRequest("workspace is required");
    }
    const prepId = params.id;
    const body = await request.json();
    const action = String(body.action ?? "");
    if (!prepId || !action) {
      return badRequest("id and action are required");
    }

    const existing = await prisma.aiPrepOutput.findFirst({
      where: { id: prepId, workspaceId },
      include: { task: true },
    });
    if (!existing) {
      return badRequest("invalid prep output");
    }

    const task = existing.task;
    if (!task) {
      return badRequest("task not found");
    }

    let nextStatus = existing.status;
    let nextDescription = task.description ?? "";

    if (action === "approve") {
      nextStatus = "APPROVED";
    } else if (action === "reject") {
      nextStatus = "REJECTED";
    } else if (action === "apply") {
      if (existing.status === "REJECTED") {
        return badRequest("rejected output cannot be applied");
      }
      const appendix = buildAppendix(existing.type, existing.id, existing.output);
      if (!nextDescription.includes(appendix)) {
        nextDescription = `${nextDescription}${appendix}`;
      }
      nextStatus = "APPLIED";
    } else if (action === "revert") {
      const appendix = buildAppendix(existing.type, existing.id, existing.output);
      if (nextDescription.includes(appendix)) {
        nextDescription = nextDescription.replace(appendix, "");
      }
      nextStatus = "APPROVED";
    } else {
      return badRequest("invalid action");
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (nextDescription !== task.description) {
        await tx.task.update({
          where: { id: task.id },
          data: { description: nextDescription },
        });
      }
      return tx.aiPrepOutput.update({
        where: { id: existing.id },
        data: { status: nextStatus },
      });
    });

    await logAudit({
      actorId: userId,
      action: "AI_PREP_ACTION",
      targetWorkspaceId: workspaceId,
      metadata: {
        taskId: task.id,
        prepId: existing.id,
        type: existing.type,
        action,
        source: "ai-prep",
      },
    });

    return ok({ output: updated });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    console.error("PATCH /api/ai/prep/[id] error", error);
    return serverError("failed to update ai prep output");
  }
}
