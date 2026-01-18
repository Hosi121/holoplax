import { Prisma } from "@prisma/client";
import { requireAuth } from "../../../../lib/api-auth";
import { handleAuthError, ok } from "../../../../lib/api-response";
import { MemoryQuestionCreateSchema } from "../../../../lib/contracts/memory";
import { createDomainErrors, errorResponse } from "../../../../lib/http/errors";
import { parseBody } from "../../../../lib/http/validation";
import prisma from "../../../../lib/prisma";
import { resolveWorkspaceId } from "../../../../lib/workspace-context";

const CONFIDENCE_THRESHOLD = 0.7;
const errors = createDomainErrors("MEMORY");

const toNullableJsonInput = (
  value: unknown | null | undefined,
): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.DbNull;
  return value as Prisma.InputJsonValue;
};

export async function GET() {
  try {
    const { userId } = await requireAuth();
    const workspaceId = await resolveWorkspaceId(userId);
    const questions = await prisma.memoryQuestion.findMany({
      where: {
        status: "PENDING",
        confidence: { gte: CONFIDENCE_THRESHOLD },
        OR: [
          { userId },
          ...(workspaceId ? [{ workspaceId }] : []),
        ],
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        typeId: true,
        valueStr: true,
        valueNum: true,
        valueBool: true,
        valueJson: true,
        confidence: true,
        status: true,
        createdAt: true,
        type: {
          select: {
            key: true,
            scope: true,
            valueType: true,
            description: true,
          },
        },
      },
    });
    return ok({ questions });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    console.error("GET /api/memory/questions error", error);
    return errorResponse(error, {
      code: "MEMORY_INTERNAL",
      message: "failed to load memory questions",
      status: 500,
    });
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await requireAuth();
    const workspaceId = await resolveWorkspaceId(userId);
    const body = await parseBody(request, MemoryQuestionCreateSchema, {
      code: "MEMORY_VALIDATION",
    });
    console.info("MEMORY_QUESTION_CREATE input", {
      typeId: body.typeId,
      valueJsonType: typeof body.valueJson,
      valueJsonNull: body.valueJson === null,
    });
    const typeId = body.typeId;
    const confidence = Number(body.confidence ?? CONFIDENCE_THRESHOLD);
    const valueStr = body.valueStr ?? null;
    const valueNum = body.valueNum ?? null;
    const valueBool = body.valueBool ?? null;
    const valueJson = body.valueJson ?? null;
    console.info("MEMORY_QUESTION_CREATE normalized", {
      valueJsonType: typeof valueJson,
      valueJsonNull: valueJson === null,
    });

    const type = await prisma.memoryType.findFirst({ where: { id: typeId } });
    if (!type) {
      return errors.badRequest("invalid typeId");
    }
    if (type.scope === "WORKSPACE" && !workspaceId) {
      return errors.badRequest("workspace is required");
    }

    const question = await prisma.memoryQuestion.create({
      data: {
        typeId,
        userId: type.scope === "USER" ? userId : null,
        workspaceId: type.scope === "WORKSPACE" ? workspaceId : null,
        valueStr,
        valueNum,
        valueBool,
        valueJson: toNullableJsonInput(valueJson),
        confidence: Number.isFinite(confidence) ? confidence : CONFIDENCE_THRESHOLD,
      },
    });

    return ok({ question });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    console.error("POST /api/memory/questions error", error);
    return errorResponse(error, {
      code: "MEMORY_INTERNAL",
      message: "failed to create memory question",
      status: 500,
    });
  }
}
