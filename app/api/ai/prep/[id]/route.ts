import { requireAuth } from "../../../../../lib/api-auth";
import { handleAuthError, ok } from "../../../../../lib/api-response";
import { logAudit } from "../../../../../lib/audit";
import { AiPrepActionSchema } from "../../../../../lib/contracts/ai";
import { createDomainErrors, errorResponse } from "../../../../../lib/http/errors";
import { parseBody } from "../../../../../lib/http/validation";
import prisma from "../../../../../lib/prisma";
import { resolveWorkspaceId } from "../../../../../lib/workspace-context";

const buildAppendix = (type: string, prepId: string, output: string) =>
  `\n\n---\nAI下準備(${type}:${prepId})\n${output}`;
const errors = createDomainErrors("AI");

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const { userId } = await requireAuth();
    const workspaceId = await resolveWorkspaceId(userId);
    if (!workspaceId) {
      return errors.badRequest("workspace is required");
    }
    const prepId = params.id;
    const body = await parseBody(request, AiPrepActionSchema, {
      code: "AI_VALIDATION",
    });
    const action = body.action;
    if (!prepId) {
      return errors.badRequest("id is required");
    }

    const existing = await prisma.aiPrepOutput.findFirst({
      where: { id: prepId, workspaceId },
      include: { task: true },
    });
    if (!existing) {
      return errors.badRequest("invalid prep output");
    }

    const task = existing.task;
    if (!task) {
      return errors.badRequest("task not found");
    }

    let nextStatus = existing.status;
    let nextDescription = task.description ?? "";

    if (action === "approve") {
      nextStatus = "APPROVED";
    } else if (action === "reject") {
      nextStatus = "REJECTED";
    } else if (action === "apply") {
      if (existing.status === "REJECTED") {
        return errors.badRequest("rejected output cannot be applied");
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
      return errors.badRequest("invalid action");
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
    return errorResponse(error, {
      code: "AI_INTERNAL",
      message: "failed to update ai prep output",
      status: 500,
    });
  }
}
