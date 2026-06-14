import { Prisma } from "@prisma/client";
import { requireWorkspaceAuth } from "../../../../lib/api-guards";
import { withApiHandler } from "../../../../lib/api-handler";
import { ok } from "../../../../lib/api-response";
import { logAudit } from "../../../../lib/audit";
import { MemoryQuestionCreateSchema } from "../../../../lib/contracts/memory";
import { createDomainErrors } from "../../../../lib/http/errors";
import { parseBody } from "../../../../lib/http/validation";
import { logger } from "../../../../lib/logger";
import prisma from "../../../../lib/prisma";

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
  return withApiHandler(
    {
      logLabel: "GET /api/memory/questions",
      errorFallback: {
        code: "MEMORY_INTERNAL",
        message: "failed to load memory questions",
        status: 500,
      },
    },
    async () => {
      const { userId, workspaceId } = await requireWorkspaceAuth();
      const questions = await prisma.memoryQuestion.findMany({
        where: {
          status: "PENDING",
          confidence: { gte: CONFIDENCE_THRESHOLD },
          OR: [{ userId }, ...(workspaceId ? [{ workspaceId }] : [])],
        },
        orderBy: { createdAt: "asc" },
        take: 50,
        select: {
          id: true,
          definitionId: true,
          valueStr: true,
          valueNum: true,
          valueBool: true,
          valueJson: true,
          confidence: true,
          status: true,
          createdAt: true,
          definition: {
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
    },
  );
}

export async function POST(request: Request) {
  return withApiHandler(
    {
      logLabel: "POST /api/memory/questions",
      errorFallback: {
        code: "MEMORY_INTERNAL",
        message: "failed to create memory question",
        status: 500,
      },
    },
    async () => {
      const { userId, workspaceId } = await requireWorkspaceAuth();
      const body = await parseBody(request, MemoryQuestionCreateSchema, {
        code: "MEMORY_VALIDATION",
      });
      logger.debug("MEMORY_QUESTION_CREATE input", {
        definitionId: body.definitionId,
        valueJsonType: typeof body.valueJson,
        valueJsonNull: body.valueJson === null,
      });
      const definitionId = body.definitionId;
      const confidence = Number(body.confidence ?? CONFIDENCE_THRESHOLD);
      const valueStr = body.valueStr ?? null;
      const valueNum = body.valueNum ?? null;
      const valueBool = body.valueBool ?? null;
      const valueJson = body.valueJson ?? null;
      logger.debug("MEMORY_QUESTION_CREATE normalized", {
        valueJsonType: typeof valueJson,
        valueJsonNull: valueJson === null,
      });

      const type = await prisma.memoryDefinition.findFirst({ where: { id: definitionId } });
      if (!type) {
        return errors.badRequest("invalid definitionId");
      }
      if (type.scope === "WORKSPACE" && !workspaceId) {
        return errors.badRequest("workspace is required");
      }

      const question = await prisma.memoryQuestion.create({
        data: {
          definitionId,
          userId: type.scope === "USER" ? userId : null,
          workspaceId: type.scope === "WORKSPACE" ? workspaceId : null,
          valueStr,
          valueNum,
          valueBool,
          valueJson: toNullableJsonInput(valueJson),
          confidence: Number.isFinite(confidence) ? confidence : CONFIDENCE_THRESHOLD,
        },
      });

      await logAudit({
        actorId: userId,
        action: "MEMORY_QUESTION_CREATE",
        targetWorkspaceId: workspaceId ?? undefined,
        metadata: { questionId: question.id, definitionId, scope: type.scope },
      });
      return ok({ question });
    },
  );
}
