import { withApiHandler } from "../../../../lib/api-handler";
import { ok } from "../../../../lib/api-response";
import { applyAutomationForTask } from "../../../../lib/automation";
import { PENDING_APPROVAL_TAG } from "../../../../lib/automation-constants";
import { DiscordCreateTaskSchema } from "../../../../lib/contracts/integrations";
import { createDomainErrors } from "../../../../lib/http/errors";
import { parseBody } from "../../../../lib/http/validation";
import { validateSharedToken } from "../../../../lib/integrations/auth";
import prisma from "../../../../lib/prisma";
import { TASK_STATUS, TASK_TYPE } from "../../../../lib/types";
import { resolveWorkspaceId } from "../../../../lib/workspace-context";

export async function POST(request: Request) {
  const errors = createDomainErrors("INTEGRATION");
  return withApiHandler(
    {
      logLabel: "POST /api/integrations/discord",
      errorFallback: {
        code: "INTEGRATION_INTERNAL",
        message: "failed to handle discord request",
        status: 500,
      },
    },
    async () => {
      const authError = validateSharedToken(request, ["DISCORD_INTEGRATION_TOKEN"]);
      if (authError) return authError;

      const body = await parseBody(request, DiscordCreateTaskSchema, {
        code: "INTEGRATION_VALIDATION",
        allowEmpty: true,
      });
      const rawTitle = String(body.title ?? body.content ?? "").trim();
      const description = String(body.description ?? "").trim();
      const points = Number(body.points ?? 3);
      const urgency = String(body.urgency ?? "中");
      const risk = String(body.risk ?? "中");
      const userId =
        process.env.DISCORD_USER_ID ?? process.env.INTEGRATION_USER_ID ?? "";
      const workspaceEnv = process.env.DISCORD_WORKSPACE_ID ?? "";

      if (!rawTitle) {
        return errors.badRequest("title is required");
      }

      const title = rawTitle.slice(0, 140);

      // workspace を決定（env > ユーザーのデフォルト）
      let workspaceId = workspaceEnv || null;
      if (!workspaceId && userId) {
        workspaceId = await resolveWorkspaceId(userId);
      }
      if (!workspaceId) {
        return errors.badRequest(
          "workspaceId not resolved; set DISCORD_WORKSPACE_ID or DISCORD_USER_ID",
        );
      }

      const task = await prisma.task.create({
        data: {
          title,
          description,
          points: Number.isFinite(points) && points > 0 ? points : 3,
          urgency,
          risk,
          status: TASK_STATUS.BACKLOG,
          type: TASK_TYPE.PBI,
          tags: [PENDING_APPROVAL_TAG], // default to approval flow for high-score cases
          workspace: { connect: { id: workspaceId } },
          user: userId ? { connect: { id: userId } } : undefined,
        },
      });

      if (userId) {
        await applyAutomationForTask({
          userId,
          workspaceId,
          task: {
            id: task.id,
            title: task.title,
            description: task.description ?? "",
            points: task.points,
            status: task.status,
          },
        });
      }

      return ok({ taskId: task.id, workspaceId });
    },
  );
}
