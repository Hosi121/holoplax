import prisma from "../../../lib/prisma";
import type {
  AutomationSettings,
  AutomationSettingsPort,
} from "../application/automation-settings";

const DEFAULT_LOW = 35;
const DEFAULT_HIGH = 70;

const toSettings = (
  workspaceId: string,
  saved?: { low: number; high: number; stage: number } | null,
): AutomationSettings => {
  const low = saved?.low ?? DEFAULT_LOW;
  const high = saved?.high ?? DEFAULT_HIGH;
  return {
    low,
    high,
    stage: saved?.stage ?? 0,
    effectiveLow: low,
    effectiveHigh: high,
    workspaceId,
  };
};

export const prismaAutomationSettingsPort: AutomationSettingsPort = {
  async get(actor) {
    // A read must not create database state. Defaults are materialized only
    // when the user changes or resets the settings.
    const current = await prisma.userAutomationSetting.findUnique({
      where: {
        userId_workspaceId: { userId: actor.userId, workspaceId: actor.workspaceId },
      },
      select: { low: true, high: true, stage: true },
    });
    return toSettings(actor.workspaceId, current);
  },

  update(actor, thresholds) {
    return prisma.$transaction(async (tx) => {
      const saved = await tx.userAutomationSetting.upsert({
        where: {
          userId_workspaceId: { userId: actor.userId, workspaceId: actor.workspaceId },
        },
        update: thresholds,
        create: { ...thresholds, stage: 0, userId: actor.userId, workspaceId: actor.workspaceId },
        select: { low: true, high: true, stage: true },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.userId,
          action: "AUTOMATION_SETTINGS_UPDATE",
          targetWorkspaceId: actor.workspaceId,
          metadata: { low: saved.low, high: saved.high, stage: saved.stage },
        },
      });
      return toSettings(actor.workspaceId, saved);
    });
  },

  resetStage(actor) {
    return prisma.$transaction(async (tx) => {
      const previous = await tx.userAutomationSetting.findUnique({
        where: {
          userId_workspaceId: { userId: actor.userId, workspaceId: actor.workspaceId },
        },
        select: { stage: true },
      });
      const saved = await tx.userAutomationSetting.upsert({
        where: {
          userId_workspaceId: { userId: actor.userId, workspaceId: actor.workspaceId },
        },
        update: { stage: 0, lastStageAt: null },
        create: {
          low: DEFAULT_LOW,
          high: DEFAULT_HIGH,
          stage: 0,
          userId: actor.userId,
          workspaceId: actor.workspaceId,
        },
        select: { low: true, high: true, stage: true },
      });
      await tx.automationStageHistory.create({
        data: {
          userId: actor.userId,
          workspaceId: actor.workspaceId,
          stage: 0,
          reason: "manual_reset",
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: actor.userId,
          action: "AUTOMATION_STAGE_RESET",
          targetWorkspaceId: actor.workspaceId,
          metadata: { previousStage: previous?.stage ?? 0 },
        },
      });
      return toSettings(actor.workspaceId, saved);
    });
  },
};
