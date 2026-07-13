import { Prisma } from "@prisma/client";
import prisma from "../../../lib/prisma";
import { ApplicationError } from "../../shared/application/application-error";
import type { MemoryOperationsPort } from "../application/memory-operations";
import {
  defaultMemoryDefinitions,
  isMemoryScope,
  isMemoryValueType,
  type MemoryScope,
  parseMemoryValue,
} from "../domain/memory-values";

const badRequest = (message: string) =>
  new ApplicationError("MEMORY_BAD_REQUEST", message, "bad_request");
const toJson = (value: unknown | null | undefined) => {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.DbNull;
  return value as Prisma.InputJsonValue;
};

const ensureDefinitions = async (scopes: MemoryScope[]) => {
  const targets = defaultMemoryDefinitions.filter(([, scope]) => scopes.includes(scope));
  if (!targets.length) return;
  await prisma.$transaction(
    targets.map(([key, scope, valueType, unit, granularity, decayDays, description]) =>
      prisma.memoryDefinition.upsert({
        where: { key_scope: { key, scope } },
        update: {
          valueType,
          unit,
          granularity,
          updatePolicy: "manual",
          decayDays,
          description,
        },
        create: {
          key,
          scope,
          valueType,
          unit,
          granularity,
          updatePolicy: "manual",
          decayDays,
          description,
        },
      }),
    ),
  );
};

export const prismaMemoryOperationsPort: MemoryOperationsPort = {
  async list(actor) {
    const scopes: MemoryScope[] = actor.workspaceId ? ["USER", "WORKSPACE"] : ["USER"];
    await ensureDefinitions(scopes);
    const [definitions, userClaims, workspaceClaims] = await Promise.all([
      prisma.memoryDefinition.findMany({
        where: { scope: { in: scopes } },
        orderBy: { key: "asc" },
        take: 100,
      }),
      prisma.memoryClaim.findMany({
        where: { userId: actor.userId, status: "ACTIVE" },
        orderBy: { updatedAt: "desc" },
        distinct: ["definitionId"],
        take: 100,
      }),
      actor.workspaceId
        ? prisma.memoryClaim.findMany({
            where: { workspaceId: actor.workspaceId, status: "ACTIVE" },
            orderBy: { updatedAt: "desc" },
            distinct: ["definitionId"],
            take: 100,
          })
        : [],
    ]);
    return { definitions, userClaims, workspaceClaims, workspaceId: actor.workspaceId };
  },

  createClaim(actor, definitionId, value) {
    return prisma.$transaction(async (tx) => {
      const definition = await tx.memoryDefinition.findUnique({ where: { id: definitionId } });
      if (!definition) throw badRequest("invalid definitionId");
      if (!isMemoryScope(definition.scope) || !isMemoryValueType(definition.valueType)) {
        throw badRequest("invalid memory type configuration");
      }
      if (definition.updatePolicy !== "manual") {
        throw badRequest("derived memory cannot be edited manually");
      }
      if (definition.scope === "WORKSPACE" && !actor.workspaceId) {
        throw badRequest("workspace is required");
      }
      const parsed = parseMemoryValue(value, definition.valueType);
      if (!parsed.ok) throw badRequest(parsed.reason);
      const now = new Date();
      await tx.memoryClaim.updateMany({
        where:
          definition.scope === "USER"
            ? { definitionId, userId: actor.userId, status: "ACTIVE" }
            : { definitionId, workspaceId: actor.workspaceId, status: "ACTIVE" },
        data: { status: "STALE", validTo: now },
      });
      const claim = await tx.memoryClaim.create({
        data: {
          definitionId,
          userId: definition.scope === "USER" ? actor.userId : null,
          workspaceId: definition.scope === "WORKSPACE" ? actor.workspaceId : null,
          ...parsed.data,
          valueJson: "valueJson" in parsed.data ? toJson(parsed.data.valueJson) : undefined,
          provenance: "EXPLICIT",
          status: "ACTIVE",
          validFrom: now,
          confidence: 0.7,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.userId,
          action: "MEMORY_CLAIM_CREATE",
          targetWorkspaceId: actor.workspaceId,
          metadata: { claimId: claim.id, definitionId, scope: definition.scope },
        },
      });
      return claim;
    });
  },

  deleteClaim(actor, claimId) {
    return prisma.$transaction(async (tx) => {
      const claim = await tx.memoryClaim.findFirst({
        where: {
          id: claimId,
          OR: [
            { userId: actor.userId },
            ...(actor.workspaceId ? [{ workspaceId: actor.workspaceId }] : []),
          ],
        },
      });
      if (!claim) throw badRequest("invalid claimId");
      const updated = await tx.memoryClaim.update({
        where: { id: claim.id },
        data: { status: "STALE", validTo: new Date() },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.userId,
          action: "MEMORY_CLAIM_DELETE",
          targetWorkspaceId: actor.workspaceId,
          metadata: { claimId, definitionId: claim.definitionId },
        },
      });
      return updated;
    });
  },

  listQuestions(actor) {
    return prisma.memoryQuestion.findMany({
      where: {
        status: "PENDING",
        confidence: { gte: 0.7 },
        OR: [
          { userId: actor.userId },
          ...(actor.workspaceId ? [{ workspaceId: actor.workspaceId }] : []),
        ],
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
        definition: { select: { key: true, scope: true, valueType: true, description: true } },
      },
    });
  },

  createQuestion(actor, input) {
    return prisma.$transaction(async (tx) => {
      const definition = await tx.memoryDefinition.findUnique({
        where: { id: input.definitionId },
        select: { scope: true },
      });
      if (!definition) throw badRequest("invalid definitionId");
      if (definition.scope === "WORKSPACE" && !actor.workspaceId) {
        throw badRequest("workspace is required");
      }
      const question = await tx.memoryQuestion.create({
        data: {
          definitionId: input.definitionId,
          userId: definition.scope === "USER" ? actor.userId : null,
          workspaceId: definition.scope === "WORKSPACE" ? actor.workspaceId : null,
          valueStr: input.valueStr ?? null,
          valueNum: input.valueNum ?? null,
          valueBool: input.valueBool ?? null,
          valueJson: toJson(input.valueJson ?? null),
          confidence: Number.isFinite(input.confidence) ? (input.confidence ?? 0.7) : 0.7,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.userId,
          action: "MEMORY_QUESTION_CREATE",
          targetWorkspaceId: actor.workspaceId,
          metadata: {
            questionId: question.id,
            definitionId: input.definitionId,
            scope: definition.scope,
          },
        },
      });
      return question;
    });
  },

  actOnQuestion(actor, questionId, action) {
    return prisma.$transaction(async (tx) => {
      const question = await tx.memoryQuestion.findFirst({
        where: {
          id: questionId,
          OR: [
            { userId: actor.userId },
            ...(actor.workspaceId ? [{ workspaceId: actor.workspaceId }] : []),
          ],
        },
        include: { definition: { select: { scope: true } } },
      });
      if (!question) throw badRequest("invalid question");
      const nextStatus =
        action === "accept" ? "ACCEPTED" : action === "reject" ? "REJECTED" : "HOLD";
      const claimed = await tx.memoryQuestion.updateMany({
        where: {
          id: question.id,
          status:
            action === "accept" || action === "reject" ? { in: ["PENDING", "HOLD"] } : "PENDING",
        },
        data: { status: nextStatus },
      });
      if (!claimed.count) throw badRequest("question was already resolved");
      if (action === "accept") {
        const now = new Date();
        await tx.memoryClaim.updateMany({
          where:
            question.definition.scope === "USER"
              ? { definitionId: question.definitionId, userId: actor.userId, status: "ACTIVE" }
              : {
                  definitionId: question.definitionId,
                  workspaceId: actor.workspaceId,
                  status: "ACTIVE",
                },
          data: { status: "STALE", validTo: now },
        });
        await tx.memoryClaim.create({
          data: {
            definitionId: question.definitionId,
            userId: question.definition.scope === "USER" ? actor.userId : null,
            workspaceId: question.definition.scope === "WORKSPACE" ? actor.workspaceId : null,
            valueStr: question.valueStr,
            valueNum: question.valueNum,
            valueBool: question.valueBool,
            valueJson: toJson(question.valueJson),
            confidence: question.confidence,
            provenance: "INFERRED",
            status: "ACTIVE",
            validFrom: now,
          },
        });
      }
      await tx.auditLog.create({
        data: {
          actorId: actor.userId,
          action: `MEMORY_QUESTION_${nextStatus}`,
          targetWorkspaceId: actor.workspaceId,
          metadata: { questionId, definitionId: question.definitionId },
        },
      });
      return { id: question.id, status: nextStatus };
    });
  },
};
