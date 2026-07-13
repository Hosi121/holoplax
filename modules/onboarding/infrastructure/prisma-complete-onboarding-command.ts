import prisma from "../../../lib/prisma";
import { SEVERITY, TASK_STATUS, TASK_TYPE } from "../../../lib/types";
import { persistNewTask } from "../../tasks/infrastructure/prisma-task-writer";
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
      const createdTasks = [];
      let goalTaskId: string | null = null;

      if (command.goalTitle) {
        const task = await persistNewTask(
          tx,
          {
            title: command.goalTitle,
            description: command.goalDescription,
            points: command.points ?? 3,
            urgency: SEVERITY.MEDIUM,
            risk: SEVERITY.MEDIUM,
            status: TASK_STATUS.BACKLOG,
            type: TASK_TYPE.EPIC,
            userId,
            workspaceId: workspace.id,
          },
          { actorId: userId, trigger: "API" },
        );
        goalTaskId = task.id;
        createdTasks.push(task);
      }

      const cadence =
        command.routineCadence === "DAILY" || command.routineCadence === "WEEKLY"
          ? command.routineCadence
          : null;
      if (command.routineTitle && cadence) {
        const dueAt = new Date();
        dueAt.setDate(dueAt.getDate() + (cadence === "DAILY" ? 1 : 7));
        const nextAt = new Date(dueAt);
        nextAt.setDate(nextAt.getDate() + (cadence === "DAILY" ? 1 : 7));
        createdTasks.push(
          await persistNewTask(
            tx,
            {
              title: command.routineTitle,
              description: command.routineDescription,
              points: 1,
              urgency: SEVERITY.MEDIUM,
              risk: SEVERITY.LOW,
              status: TASK_STATUS.BACKLOG,
              type: TASK_TYPE.TASK,
              dueDate: dueAt,
              userId,
              workspaceId: workspace.id,
              routineRule: { cadence, nextAt },
            },
            { actorId: userId, trigger: "API" },
          ),
        );
      }
      for (const title of (command.focusTasks ?? [])
        .map((value) => value.trim())
        .filter(Boolean)
        .slice(0, 3)) {
        createdTasks.push(
          await persistNewTask(
            tx,
            {
              title,
              points: 1,
              urgency: SEVERITY.MEDIUM,
              risk: SEVERITY.MEDIUM,
              status: TASK_STATUS.BACKLOG,
              type: TASK_TYPE.TASK,
              userId,
              workspaceId: workspace.id,
            },
            { actorId: userId, trigger: "API" },
          ),
        );
      }

      await tx.auditLog.create({
        data: {
          actorId: userId,
          action: "ONBOARDING_COMPLETE",
          targetWorkspaceId: workspace.id,
          metadata: {
            intent: command.intent ?? "",
            goalTitle: command.goalTitle ?? "",
            taskId: goalTaskId,
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
        createdTasks,
      };
    });
  },
};
