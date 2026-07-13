import { NextResponse } from "next/server";
import { requireAuth } from "../../../lib/api-auth";
import { withApiHandler } from "../../../lib/api-handler";
import { ok } from "../../../lib/api-response";
import { logAudit } from "../../../lib/audit";
import { OnboardingSchema } from "../../../lib/contracts/onboarding";
import { parseBody } from "../../../lib/http/validation";
import prisma from "../../../lib/prisma";
import { SEVERITY, TASK_TYPE } from "../../../lib/types";

export async function POST(request: Request) {
  return withApiHandler(
    {
      logLabel: "POST /api/onboarding",
      errorFallback: {
        code: "ONBOARDING_INTERNAL",
        message: "failed to complete onboarding",
        status: 500,
      },
    },
    async () => {
      const { userId } = await requireAuth();
      const body = await parseBody(request, OnboardingSchema, {
        code: "ONBOARDING_VALIDATION",
      });
      const workspaceName = body.workspaceName;
      const goalTitle = body.goalTitle ?? "";
      const goalDescription = body.goalDescription ?? "";
      const intent = body.intent ?? "";
      const points = Number(body.points ?? 3);
      const routineTitle = body.routineTitle ?? "";
      const routineDescription = body.routineDescription ?? "";
      const routineCadence =
        body.routineCadence === "DAILY" || body.routineCadence === "WEEKLY"
          ? body.routineCadence
          : null;
      const focusTasks: string[] = Array.isArray(body.focusTasks)
        ? body.focusTasks.map((task: string) => String(task).trim()).filter(Boolean)
        : [];

      // Claim completion and create every onboarding artifact atomically. The
      // conditional update also makes concurrent submissions idempotent.
      const result = await prisma.$transaction(async (tx) => {
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
          if (!existing?.onboardingCompletedAt) {
            throw new Error("authenticated user not found");
          }
          return { created: false as const, completedAt: existing.onboardingCompletedAt };
        }

        const workspace = await tx.workspace.create({
          data: {
            name: workspaceName,
            ownerId: userId,
            members: { create: { userId, role: "owner" } },
          },
        });

        const task = goalTitle
          ? await tx.task.create({
              data: {
                title: goalTitle,
                description: goalDescription,
                points: Number.isFinite(points) ? points : 3,
                urgency: SEVERITY.MEDIUM,
                risk: SEVERITY.MEDIUM,
                status: "BACKLOG",
                type: TASK_TYPE.EPIC,
                userId,
                workspaceId: workspace.id,
              },
              select: { id: true },
            })
          : null;
        if (routineTitle && routineCadence) {
          const dueAt = new Date();
          dueAt.setDate(dueAt.getDate() + (routineCadence === "DAILY" ? 1 : 7));
          const nextAt = new Date(dueAt);
          nextAt.setDate(nextAt.getDate() + (routineCadence === "DAILY" ? 1 : 7));
          await tx.task.create({
            data: {
              title: routineTitle,
              description: routineDescription,
              points: 1,
              urgency: SEVERITY.MEDIUM,
              risk: SEVERITY.LOW,
              status: "BACKLOG",
              type: TASK_TYPE.TASK,
              dueDate: dueAt,
              userId,
              workspaceId: workspace.id,
              routineRule: { create: { cadence: routineCadence, nextAt } },
            },
          });
        }
        if (focusTasks.length > 0) {
          await tx.task.createMany({
            data: focusTasks.slice(0, 3).map((title) => ({
              title,
              description: "",
              points: 1,
              urgency: SEVERITY.MEDIUM,
              risk: SEVERITY.MEDIUM,
              status: "BACKLOG",
              type: TASK_TYPE.TASK,
              userId,
              workspaceId: workspace.id,
            })),
          });
        }

        return {
          created: true as const,
          completedAt,
          workspaceId: workspace.id,
          taskId: task?.id ?? null,
        };
      });

      if (!result.created) {
        return ok({ completedAt: result.completedAt });
      }

      await logAudit({
        actorId: userId,
        action: "ONBOARDING_COMPLETE",
        targetWorkspaceId: result.workspaceId,
        metadata: {
          intent,
          goalTitle,
          taskId: result.taskId,
          routineTitle,
          routineCadence,
          focusTasks,
        },
      });

      const response = NextResponse.json({
        workspaceId: result.workspaceId,
        completedAt: result.completedAt,
      });
      response.cookies.set("workspaceId", result.workspaceId, {
        path: "/",
        sameSite: "lax",
      });
      return response;
    },
  );
}
