import { Prisma, MemoryScope, MemorySource, MemoryStatus, MemoryValueType } from "@prisma/client";
import { requireAuth } from "../../../lib/api-auth";
import { handleAuthError, ok } from "../../../lib/api-response";
import { MemoryClaimCreateSchema, MemoryClaimDeleteSchema } from "../../../lib/contracts/memory";
import { createDomainErrors, errorResponse } from "../../../lib/http/errors";
import { parseBody } from "../../../lib/http/validation";
import prisma from "../../../lib/prisma";
import { resolveWorkspaceId } from "../../../lib/workspace-context";

const errors = createDomainErrors("MEMORY");

const isMemoryScope = (value: unknown): value is MemoryScope =>
  value === "USER" || value === "WORKSPACE";

const isMemoryValueType = (value: unknown): value is MemoryValueType =>
  value === "STRING" ||
  value === "NUMBER" ||
  value === "BOOL" ||
  value === "JSON" ||
  value === "RATIO" ||
  value === "DURATION_MS" ||
  value === "HISTOGRAM_24x7" ||
  value === "RATIO_BY_TYPE";

const toNullableJsonInput = (
  value: unknown | null | undefined,
): Prisma.NullableJsonNullValueInput | Prisma.InputJsonValue | undefined => {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.DbNull;
  return value as Prisma.InputJsonValue;
};

const defaultMemoryTypes = [
  {
    key: "life_rhythm",
    scope: "USER",
    valueType: "HISTOGRAM_24x7",
    unit: null,
    granularity: "weekly",
    updatePolicy: "manual",
    decayDays: 56,
    description: "活動時間帯の分布",
  },
  {
    key: "deadline_strictness",
    scope: "USER",
    valueType: "RATIO",
    unit: null,
    granularity: "daily",
    updatePolicy: "manual",
    decayDays: 30,
    description: "期限遵守の厳しさ (0-1)",
  },
  {
    key: "execution_pattern",
    scope: "USER",
    valueType: "STRING",
    unit: null,
    granularity: "daily",
    updatePolicy: "manual",
    decayDays: 30,
    description: "実行パターンや習慣",
  },
  {
    key: "sprint_length",
    scope: "WORKSPACE",
    valueType: "NUMBER",
    unit: "days",
    granularity: "static",
    updatePolicy: "manual",
    decayDays: null,
    description: "スプリント長 (日)",
  },
  {
    key: "team_dod",
    scope: "WORKSPACE",
    valueType: "STRING",
    unit: null,
    granularity: "static",
    updatePolicy: "manual",
    decayDays: null,
    description: "Definition of Done",
  },
  {
    key: "team_workflow_schema",
    scope: "WORKSPACE",
    valueType: "JSON",
    unit: null,
    granularity: "static",
    updatePolicy: "manual",
    decayDays: null,
    description: "ステータス/遷移のスキーマ",
  },
];

const ensureMemoryTypes = async (scopes: MemoryScope[]) => {
  const targets = defaultMemoryTypes.filter((item) => scopes.includes(item.scope as MemoryScope));
  if (!targets.length) return;
  await prisma.$transaction(
    targets.map((item) =>
      prisma.memoryType.upsert({
        where: { key_scope: { key: item.key, scope: item.scope as MemoryScope } },
        update: {
          valueType: item.valueType as MemoryValueType,
          unit: item.unit,
          granularity: item.granularity,
          updatePolicy: item.updatePolicy,
          decayDays: item.decayDays,
          description: item.description,
        },
        create: {
          key: item.key,
          scope: item.scope as MemoryScope,
          valueType: item.valueType as MemoryValueType,
          unit: item.unit,
          granularity: item.granularity,
          updatePolicy: item.updatePolicy,
          decayDays: item.decayDays,
          description: item.description,
        },
      }),
    ),
  );
};

const parseValue = (value: unknown, valueType: MemoryValueType) => {
  if (value === null || value === undefined || value === "") {
    return { ok: false, reason: "value is required" };
  }
  if (valueType === "STRING") {
    return { ok: true, data: { valueStr: String(value) } };
  }
  if (valueType === "NUMBER" || valueType === "DURATION_MS") {
    const num = Number(value);
    if (Number.isNaN(num)) return { ok: false, reason: "invalid number" };
    return { ok: true, data: { valueNum: num } };
  }
  if (valueType === "RATIO") {
    const num = Number(value);
    if (Number.isNaN(num) || num < 0 || num > 1) {
      return { ok: false, reason: "ratio must be 0..1" };
    }
    return { ok: true, data: { valueNum: num } };
  }
  if (valueType === "BOOL") {
    if (typeof value === "boolean") {
      return { ok: true, data: { valueBool: value } };
    }
    if (value === "true" || value === "false") {
      return { ok: true, data: { valueBool: value === "true" } };
    }
    return { ok: false, reason: "invalid boolean" };
  }
  if (valueType === "JSON" || valueType === "HISTOGRAM_24x7" || valueType === "RATIO_BY_TYPE") {
    if (typeof value === "string") {
      try {
        return { ok: true, data: { valueJson: JSON.parse(value) } };
      } catch {
        return { ok: false, reason: "invalid json" };
      }
    }
    return { ok: true, data: { valueJson: value } };
  }
  return { ok: false, reason: "unsupported value type" };
};

export async function GET() {
  try {
    const { userId } = await requireAuth();
    const workspaceId = await resolveWorkspaceId(userId);
    const scopes: MemoryScope[] = workspaceId ? ["USER", "WORKSPACE"] : ["USER"];

    await ensureMemoryTypes(scopes);

    const types = await prisma.memoryType.findMany({
      where: { scope: { in: scopes } },
      orderBy: { key: "asc" },
    });

    const userClaims = await prisma.memoryClaim.findMany({
      where: { userId, status: "ACTIVE" },
      orderBy: { updatedAt: "desc" },
      distinct: ["typeId"],
    });

    const workspaceClaims = workspaceId
      ? await prisma.memoryClaim.findMany({
          where: { workspaceId, status: "ACTIVE" },
          orderBy: { updatedAt: "desc" },
          distinct: ["typeId"],
        })
      : [];

    return ok({ types, userClaims, workspaceClaims, workspaceId });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    console.error("GET /api/memory error", error);
    return errorResponse(error, {
      code: "MEMORY_INTERNAL",
      message: "failed to load memory",
      status: 500,
    });
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await requireAuth();
    const workspaceId = await resolveWorkspaceId(userId);
    const body = await parseBody(request, MemoryClaimCreateSchema, {
      code: "MEMORY_VALIDATION",
    });
    console.info("MEMORY_CLAIM_CREATE input", {
      typeId: body.typeId,
      valueType: typeof body.value,
      valueNull: body.value === null,
    });
    const typeId = body.typeId;
    const rawValue = body.value;

    const type = await prisma.memoryType.findFirst({
      where: { id: typeId },
    });
    if (!type) {
      return errors.badRequest("invalid typeId");
    }
    if (!isMemoryScope(type.scope) || !isMemoryValueType(type.valueType)) {
      return errors.badRequest("invalid memory type configuration");
    }

    if (type.scope === "WORKSPACE" && !workspaceId) {
      return errors.badRequest("workspace is required");
    }

    const parsed = parseValue(rawValue, type.valueType);
    console.info("MEMORY_CLAIM_CREATE parsed", {
      ok: parsed.ok,
      valueType: type.valueType,
    });
    if (!parsed.ok) {
      return errors.badRequest(parsed.reason ?? "invalid value");
    }

    const now = new Date();
    const claim = await prisma.$transaction(async (tx) => {
      await tx.memoryClaim.updateMany({
        where:
          type.scope === "USER"
            ? { typeId, userId, status: "ACTIVE" }
            : { typeId, workspaceId, status: "ACTIVE" },
        data: { status: "STALE", validTo: now },
      });
      const data = {
        typeId,
        userId: type.scope === "USER" ? userId : null,
        workspaceId: type.scope === "WORKSPACE" ? workspaceId : null,
        ...parsed.data,
        source: "EXPLICIT" as MemorySource,
        status: "ACTIVE" as MemoryStatus,
        validFrom: now,
        confidence: 0.7,
      };
      return tx.memoryClaim.create({
        data: {
          ...data,
          valueJson:
            "valueJson" in data
              ? toNullableJsonInput((data as { valueJson?: unknown }).valueJson)
              : undefined,
        },
      });
    });

    return ok({ claim });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    console.error("POST /api/memory error", error);
    return errorResponse(error, {
      code: "MEMORY_INTERNAL",
      message: "failed to save memory",
      status: 500,
    });
  }
}

export async function DELETE(request: Request) {
  try {
    const { userId } = await requireAuth();
    const workspaceId = await resolveWorkspaceId(userId);
    const body = await parseBody(request, MemoryClaimDeleteSchema, {
      code: "MEMORY_VALIDATION",
    });
    const claimId = body.claimId;

    const claim = await prisma.memoryClaim.findFirst({
      where: { id: claimId },
    });
    if (!claim) {
      return errors.badRequest("invalid claimId");
    }

    const isOwner = claim.userId === userId;
    const isWorkspaceMember = workspaceId && claim.workspaceId === workspaceId;
    if (!isOwner && !isWorkspaceMember) {
      return errors.badRequest("not allowed");
    }

    const updated = await prisma.memoryClaim.update({
      where: { id: claimId },
      data: { status: "STALE", validTo: new Date() },
    });

    return ok({ claim: updated });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    console.error("DELETE /api/memory error", error);
    return errorResponse(error, {
      code: "MEMORY_INTERNAL",
      message: "failed to delete memory claim",
      status: 500,
    });
  }
}
