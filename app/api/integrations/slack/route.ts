import { withApiHandler } from "../../../../lib/api-handler";
import { ok } from "../../../../lib/api-response";
import { logAudit } from "../../../../lib/audit";
import { createDomainErrors } from "../../../../lib/http/errors";
import { verifySlackSignature } from "../../../../lib/integrations/auth";
import { isStoryPoint } from "../../../../lib/points";
import prisma from "../../../../lib/prisma";
import { createTask } from "../../../../lib/tasks/task-service";
import { resolveWorkspaceId } from "../../../../lib/workspace-context";

const getEnv = (key: string) => {
  const value = process.env[key];
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

export async function POST(request: Request) {
  const errors = createDomainErrors("INTEGRATION");
  return withApiHandler(
    {
      logLabel: "POST /api/integrations/slack",
      errorFallback: {
        code: "INTEGRATION_INTERNAL",
        message: "failed to handle slack request",
        status: 500,
      },
    },
    async () => {
      const signingSecret = process.env.SLACK_SIGNING_SECRET;
      if (!signingSecret) {
        return errors.unauthorized("SLACK_SIGNING_SECRET not configured");
      }

      const raw = await request.text();
      const timestamp = request.headers.get("x-slack-request-timestamp") ?? "";
      const signature = request.headers.get("x-slack-signature") ?? "";

      if (!timestamp || !signature) {
        return errors.unauthorized("missing slack headers");
      }
      const now = Math.floor(Date.now() / 1000);
      if (Math.abs(now - Number(timestamp)) > 60 * 5) {
        return errors.unauthorized("request is too old");
      }
      try {
        const okSig = verifySlackSignature(signingSecret, raw, timestamp, signature);
        if (!okSig) return errors.unauthorized();
      } catch {
        return errors.unauthorized();
      }

      const params = new URLSearchParams(raw);
      const challenge = params.get("challenge");
      if (challenge) {
        return new Response(challenge, { status: 200 });
      }

      const text = (params.get("text") ?? "").trim();
      if (!text) {
        return ok({ response_type: "ephemeral", text: "タイトルを指定してください。" });
      }
      const parts = text.split("|").map((p) => p.trim());
      const [titleRaw, description, pointsRaw] = parts;
      const title = (titleRaw ?? "").slice(0, 140);
      if (!title) {
        return ok({ response_type: "ephemeral", text: "タイトルを指定してください。" });
      }
      const pointsNum = Number(pointsRaw);
      const points = isStoryPoint(pointsNum) ? pointsNum : 3;
      const userEnv = getEnv("SLACK_USER_ID") || getEnv("INTEGRATION_USER_ID");
      let workspaceId = getEnv("SLACK_WORKSPACE_ID") || null;

      if (!workspaceId && userEnv) {
        workspaceId = await resolveWorkspaceId(userEnv);
      }
      if (!workspaceId) {
        return ok({
          response_type: "ephemeral",
          text: "workspaceId を解決できませんでした。SLACK_WORKSPACE_ID を設定してください。",
        });
      }
      if (!userEnv) {
        return ok({
          response_type: "ephemeral",
          text: "userId を解決できませんでした。SLACK_USER_ID を設定してください。",
        });
      }
      const membership = await prisma.workspaceMember.findUnique({
        where: { workspaceId_userId: { workspaceId, userId: userEnv } },
        select: { userId: true },
      });
      if (!membership) {
        return ok({
          response_type: "ephemeral",
          text: "設定されたユーザーは対象ワークスペースのメンバーではありません。",
        });
      }

      const task = await createTask({
        userId: userEnv,
        workspaceId,
        input: {
          title,
          description: description ?? "",
          points,
          status: "BACKLOG",
          type: "PBI",
        },
      });

      await logAudit({
        actorId: userEnv,
        action: "INTEGRATION_SLACK_TASK_CREATE",
        targetWorkspaceId: workspaceId,
        metadata: { taskId: task.id, title: task.title, points: task.points },
      });

      return ok({
        response_type: "in_channel",
        text: `タスクを作成しました: ${title} (${task.points}pt)`,
      });
    },
  );
}
