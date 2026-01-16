import { requireAuth } from "../../../lib/api-auth";
import {
  badRequest,
  handleAuthError,
  ok,
  serverError,
} from "../../../lib/api-response";
import prisma from "../../../lib/prisma";
import { resolveWorkspaceId } from "../../../lib/workspace-context";

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
    return ok({ low: current.low, high: current.high, workspaceId });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    console.error("GET /api/automation error", error);
    return serverError("failed to load automation");
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await requireAuth();
    const workspaceId = await resolveWorkspaceId(userId);
    if (!workspaceId) {
      return badRequest("workspace is required");
    }
    const body = await request.json();
    const low = Number(body.low);
    const high = Number(body.high);
    if (!Number.isFinite(low) || !Number.isFinite(high)) {
      return badRequest("low/high are required");
    }
    const existing = await prisma.userAutomationSetting.findFirst({
      where: { userId, workspaceId },
    });
    const saved = existing
      ? await prisma.userAutomationSetting.update({
          where: { id: existing.id },
          data: { low, high },
        })
      : await prisma.userAutomationSetting.create({
          data: { low, high, userId, workspaceId },
        });
    return ok({ low: saved.low, high: saved.high, workspaceId });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    console.error("POST /api/automation error", error);
    return serverError("failed to update automation");
  }
}
