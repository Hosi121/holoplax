import { requireAuth } from "../../../lib/api-auth";
import { handleAuthError, ok } from "../../../lib/api-response";
import { AutomationUpdateSchema } from "../../../lib/contracts/automation";
import { createDomainErrors, errorResponse } from "../../../lib/http/errors";
import { parseBody } from "../../../lib/http/validation";
import prisma from "../../../lib/prisma";
import { resolveWorkspaceId } from "../../../lib/workspace-context";

const STAGE_STEP = 5;
const errors = createDomainErrors("AUTOMATION");

export async function GET() {
  try {
    const { userId } = await requireAuth();
    const workspaceId = await resolveWorkspaceId(userId);
    if (!workspaceId) {
      return ok({ low: 35, high: 70, workspaceId: null });
    }
    const current = await prisma.userAutomationSetting.upsert({
      where: { userId_workspaceId: { userId, workspaceId } },
      update: {},
      create: { low: 35, high: 70, userId, workspaceId },
    });
    const stage = current.stage ?? 0;
    return ok({
      low: current.low,
      high: current.high,
      stage,
      effectiveLow: current.low + stage * STAGE_STEP,
      effectiveHigh: current.high + stage * STAGE_STEP,
      workspaceId,
    });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    console.error("GET /api/automation error", error);
    return errorResponse(error, {
      code: "AUTOMATION_INTERNAL",
      message: "failed to load automation",
      status: 500,
    });
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await requireAuth();
    const workspaceId = await resolveWorkspaceId(userId);
    if (!workspaceId) {
      return errors.badRequest("workspace is required");
    }
    const body = await parseBody(request, AutomationUpdateSchema, {
      code: "AUTOMATION_VALIDATION",
    });
    const low = Number(body.low);
    const high = Number(body.high);
    const stage = body.stage !== undefined ? Number(body.stage) : undefined;
    if (!Number.isFinite(low) || !Number.isFinite(high)) {
      return errors.badRequest("low/high are required");
    }
    const existing = await prisma.userAutomationSetting.findFirst({
      where: { userId, workspaceId },
    });
    const saved = existing
      ? await prisma.userAutomationSetting.update({
          where: { id: existing.id },
          data: { low, high, ...(Number.isFinite(stage) ? { stage } : {}) },
        })
      : await prisma.userAutomationSetting.create({
          data: {
            low,
            high,
            stage: Number.isFinite(stage) ? stage : 0,
            userId,
            workspaceId,
          },
        });
    const nextStage = saved.stage ?? 0;
    return ok({
      low: saved.low,
      high: saved.high,
      stage: nextStage,
      effectiveLow: saved.low + nextStage * STAGE_STEP,
      effectiveHigh: saved.high + nextStage * STAGE_STEP,
      workspaceId,
    });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    console.error("POST /api/automation error", error);
    return errorResponse(error, {
      code: "AUTOMATION_INTERNAL",
      message: "failed to update automation",
      status: 500,
    });
  }
}
