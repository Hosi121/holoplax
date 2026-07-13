import { requireWorkspaceAuth } from "../../../lib/api-guards";
import { withApiHandler } from "../../../lib/api-handler";
import { ok } from "../../../lib/api-response";
import { logAudit } from "../../../lib/audit";
import { AutomationUpdateSchema } from "../../../lib/contracts/automation";
import { parseBody } from "../../../lib/http/validation";
import prisma from "../../../lib/prisma";

export async function GET() {
  return withApiHandler(
    {
      logLabel: "GET /api/automation",
      errorFallback: {
        code: "AUTOMATION_INTERNAL",
        message: "failed to load automation",
        status: 500,
      },
    },
    async () => {
      const { userId, workspaceId } = await requireWorkspaceAuth();
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
        effectiveLow: current.low,
        effectiveHigh: current.high,
        workspaceId,
      });
    },
  );
}

export async function POST(request: Request) {
  return withApiHandler(
    {
      logLabel: "POST /api/automation",
      errorFallback: {
        code: "AUTOMATION_INTERNAL",
        message: "failed to update automation",
        status: 500,
      },
    },
    async () => {
      const { userId, workspaceId } = await requireWorkspaceAuth({
        domain: "AUTOMATION",
        requireWorkspace: true,
      });
      const body = await parseBody(request, AutomationUpdateSchema, {
        code: "AUTOMATION_VALIDATION",
      });
      // Schema guarantees low/high are finite normalized scores (0–100).
      // stage is intentionally not accepted from the client — it is server-managed.
      const { low, high } = body;
      const existing = await prisma.userAutomationSetting.findFirst({
        where: { userId, workspaceId },
      });
      const saved = existing
        ? await prisma.userAutomationSetting.update({
            where: { id: existing.id },
            data: { low, high },
          })
        : await prisma.userAutomationSetting.create({
            data: { low, high, stage: 0, userId, workspaceId },
          });
      const nextStage = saved.stage ?? 0;
      await logAudit({
        actorId: userId,
        action: "AUTOMATION_SETTINGS_UPDATE",
        targetWorkspaceId: workspaceId,
        metadata: { low, high, stage: nextStage },
      });
      return ok({
        low: saved.low,
        high: saved.high,
        stage: nextStage,
        effectiveLow: saved.low,
        effectiveHigh: saved.high,
        workspaceId,
      });
    },
  );
}

export async function DELETE() {
  return withApiHandler(
    {
      logLabel: "DELETE /api/automation",
      errorFallback: {
        code: "AUTOMATION_INTERNAL",
        message: "failed to reset automation stage",
        status: 500,
      },
    },
    async () => {
      const { userId, workspaceId } = await requireWorkspaceAuth({
        domain: "AUTOMATION",
        requireWorkspace: true,
      });
      const saved = await prisma.userAutomationSetting.upsert({
        where: { userId_workspaceId: { userId, workspaceId } },
        update: { stage: 0, lastStageAt: null },
        create: { low: 35, high: 70, stage: 0, userId, workspaceId },
      });
      await prisma.automationStageHistory.create({
        data: { userId, workspaceId, stage: 0, reason: "manual_reset" },
      });
      await logAudit({
        actorId: userId,
        action: "AUTOMATION_STAGE_RESET",
        targetWorkspaceId: workspaceId,
        metadata: { previousResetAt: new Date().toISOString() },
      });
      return ok({
        low: saved.low,
        high: saved.high,
        stage: 0,
        effectiveLow: saved.low,
        effectiveHigh: saved.high,
        workspaceId,
      });
    },
  );
}
