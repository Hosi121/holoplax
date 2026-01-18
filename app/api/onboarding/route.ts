import { NextResponse } from "next/server";
import { requireAuth } from "../../../lib/api-auth";
import { withApiHandler } from "../../../lib/api-handler";
import { ok } from "../../../lib/api-response";
import { logAudit } from "../../../lib/audit";
import { OnboardingSchema } from "../../../lib/contracts/onboarding";
import { parseBody } from "../../../lib/http/validation";
import prisma from "../../../lib/prisma";
import { TASK_TYPE } from "../../../lib/types";

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
      const goalTitle = body.goalTitle;
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

      const existing = await prisma.user.findUnique({
        where: { id: userId },
        select: { onboardingCompletedAt: true },
      });
      if (existing?.onboardingCompletedAt) {
        return ok({ completedAt: existing.onboardingCompletedAt });
      }

      const workspace = await prisma.workspace.create({
        data: {
          name: workspaceName,
          ownerId: userId,
          members: { create: { userId, role: "owner" } },
        },
      });

      const task = await prisma.task.create({
        data: {
          title: goalTitle,
          description: goalDescription,
          points: Number.isFinite(points) ? points : 3,
          urgency: "中",
          risk: "中",
          status: "BACKLOG",
          type: TASK_TYPE.EPIC,
          userId,
          workspaceId: workspace.id,
        },
        select: { id: true },
      });
      if (routineTitle && routineCadence) {
        const dueAt = new Date();
        if (routineCadence === "DAILY") {
          dueAt.setDate(dueAt.getDate() + 1);
        } else {
          dueAt.setDate(dueAt.getDate() + 7);
        }
        const routineTask = await prisma.task.create({
          data: {
            title: routineTitle,
            description: routineDescription,
            points: 1,
            urgency: "中",
            risk: "低",
            status: "BACKLOG",
            type: TASK_TYPE.ROUTINE,
            dueDate: dueAt,
            userId,
            workspaceId: workspace.id,
          },
          select: { id: true },
        });
        const nextAt = new Date(dueAt);
        if (routineCadence === "DAILY") {
          nextAt.setDate(nextAt.getDate() + 1);
        } else {
          nextAt.setDate(nextAt.getDate() + 7);
        }
        await prisma.routineRule.create({
          data: {
            taskId: routineTask.id,
            cadence: routineCadence,
            nextAt,
          },
        });
      }
      if (focusTasks.length > 0) {
        await prisma.task.createMany({
          data: focusTasks.slice(0, 3).map((title) => ({
            title,
            description: "",
            points: 1,
            urgency: "中",
            risk: "中",
            status: "BACKLOG",
            type: TASK_TYPE.TASK,
            userId,
            workspaceId: workspace.id,
          })),
        });
      }

      const completedAt = new Date();
      await prisma.user.update({
        where: { id: userId },
        data: { onboardingCompletedAt: completedAt },
      });

      await logAudit({
        actorId: userId,
        action: "ONBOARDING_COMPLETE",
        targetWorkspaceId: workspace.id,
        metadata: {
          intent,
          goalTitle,
          taskId: task.id,
          routineTitle,
          routineCadence,
          focusTasks,
        },
      });

      const response = NextResponse.json({
        workspaceId: workspace.id,
        completedAt,
      });
      response.cookies.set("workspaceId", workspace.id, {
        path: "/",
        sameSite: "lax",
      });
      return response;
    },
  );
}
