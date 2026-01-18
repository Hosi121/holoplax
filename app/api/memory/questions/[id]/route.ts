import { Prisma } from "@prisma/client";
import { requireAuth } from "../../../../../lib/api-auth";
import { handleAuthError, ok } from "../../../../../lib/api-response";
import { MemoryQuestionActionSchema } from "../../../../../lib/contracts/memory";
import { createDomainErrors, errorResponse } from "../../../../../lib/http/errors";
import { parseBody } from "../../../../../lib/http/validation";
import prisma from "../../../../../lib/prisma";
import { resolveWorkspaceId } from "../../../../../lib/workspace-context";

const pickClaimValue = (question: {
  valueStr: string | null;
  valueNum: number | null;
  valueBool: boolean | null;
  valueJson: unknown | null;
}) => {
  console.info("MEMORY_QUESTION_ACCEPT values", {
    valueJsonType: typeof question.valueJson,
    valueJsonNull: question.valueJson === null,
  });
  return {
    valueStr: question.valueStr,
    valueNum: question.valueNum,
    valueBool: question.valueBool,
    valueJson: question.valueJson,
  };
};

const toNullableJsonInput = (
  value: unknown | null | undefined,
): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.DbNull;
  return value as Prisma.InputJsonValue;
};
const errors = createDomainErrors("MEMORY");

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const { userId } = await requireAuth();
    const workspaceId = await resolveWorkspaceId(userId);
    const questionId = params.id;
    const body = await parseBody(request, MemoryQuestionActionSchema, {
      code: "MEMORY_VALIDATION",
    });
    const action = body.action;
    if (!questionId) {
      return errors.badRequest("id is required");
    }

    const question = await prisma.memoryQuestion.findFirst({
      where: { id: questionId },
      include: { type: true },
    });
    if (!question) {
      return errors.badRequest("invalid question");
    }

    const belongsToUser = question.userId === userId;
    const belongsToWorkspace = workspaceId && question.workspaceId === workspaceId;
    if (!belongsToUser && !belongsToWorkspace) {
      return errors.badRequest("not allowed");
    }

    const now = new Date();
    let nextStatus: "ACCEPTED" | "REJECTED" | "HOLD";
    if (action === "accept") {
      nextStatus = "ACCEPTED";
    } else if (action === "reject") {
      nextStatus = "REJECTED";
    } else if (action === "hold") {
      nextStatus = "HOLD";
    } else {
      return errors.badRequest("invalid action");
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (action === "accept") {
        await tx.memoryClaim.updateMany({
          where:
            question.type.scope === "USER"
              ? { typeId: question.typeId, userId, status: "ACTIVE" }
              : { typeId: question.typeId, workspaceId, status: "ACTIVE" },
          data: { status: "STALE", validTo: now },
        });
        const claimValue = pickClaimValue(question);
        await tx.memoryClaim.create({
          data: {
            typeId: question.typeId,
            userId: question.type.scope === "USER" ? userId : null,
            workspaceId: question.type.scope === "WORKSPACE" ? workspaceId : null,
            ...claimValue,
            valueJson: toNullableJsonInput(claimValue.valueJson),
            confidence: question.confidence,
            source: "INFERRED",
            status: "ACTIVE",
            validFrom: now,
          },
        });
      }

      return tx.memoryQuestion.update({
        where: { id: question.id },
        data: { status: nextStatus },
        select: {
          id: true,
          status: true,
        },
      });
    });

    return ok({ question: updated });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    console.error("PATCH /api/memory/questions/[id] error", error);
    return errorResponse(error, {
      code: "MEMORY_INTERNAL",
      message: "failed to update memory question",
      status: 500,
    });
  }
}
