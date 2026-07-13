import prisma from "../../../lib/prisma";
import type { CompleteOnboardingCommandPort } from "../application/complete-onboarding-command";

export const prismaCompleteOnboardingCommandPort: CompleteOnboardingCommandPort = {
  execute(userId, command) {
    return prisma.$transaction(async (tx) => {
      const completedAt = new Date();
      const claimed = await tx.user.updateMany({
        where: { id: userId, onboardingCompletedAt: null },
        data: { onboardingCompletedAt: completedAt },
      });
      if (!claimed.count) {
        const existing = await tx.user.findUnique({
          where: { id: userId },
          select: { onboardingCompletedAt: true },
        });
        if (!existing?.onboardingCompletedAt) throw new Error("authenticated user not found");
        return { created: false as const, completedAt: existing.onboardingCompletedAt };
      }

      const workspace = await tx.workspace.create({
        data: {
          name: command.workspaceName,
          ownerId: userId,
          members: { create: { userId, role: "owner" } },
        },
      });
      const cadence =
        command.routineCadence === "DAILY" || command.routineCadence === "WEEKLY"
          ? command.routineCadence
          : null;
      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: "ONBOARDING_COMPLETE",
          targetWorkspaceId: workspace.id,
          metadata: {
            intent: command.intent ?? "",
            goalTitle: command.goalTitle ?? "",
            routineTitle: command.routineTitle ?? "",
            routineCadence: cadence,
            focusTasks: command.focusTasks ?? [],
          },
        },
      });
      return {
        created: true as const,
        completedAt,
        workspaceId: workspace.id,
      };
    });
  },
};
