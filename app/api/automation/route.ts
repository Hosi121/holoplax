import { AuthError, requireAuth } from "../../../lib/api-auth";
import {
  badRequest,
  handleAuthError,
  ok,
  serverError,
} from "../../../lib/api-response";
import prisma from "../../../lib/prisma";

export async function GET() {
  try {
    const { userId } = await requireAuth();
    const current =
      (await prisma.userAutomationSetting.findFirst({
        where: { userId },
      })) ??
      (await prisma.userAutomationSetting.create({
        data: { low: 35, high: 70, userId },
      }));
    return ok({ low: current.low, high: current.high });
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
    const body = await request.json();
    const low = Number(body.low);
    const high = Number(body.high);
    if (!Number.isFinite(low) || !Number.isFinite(high)) {
      return badRequest("low/high are required");
    }
    const existing = await prisma.userAutomationSetting.findFirst({
      where: { userId },
    });
    const saved = existing
      ? await prisma.userAutomationSetting.update({
          where: { id: existing.id },
          data: { low, high },
        })
      : await prisma.userAutomationSetting.create({
          data: { low, high, userId },
        });
    return ok({ low: saved.low, high: saved.high });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    console.error("POST /api/automation error", error);
    return serverError("failed to update automation");
  }
}
