import { ok, unauthorized, unauthorizedWithMessage } from "../../../../lib/api-response";
import { applyAutomationForTask } from "../../../../lib/automation";
import { verifySlackSignature } from "../../../../lib/integrations/auth";
import prisma from "../../../../lib/prisma";
import { TASK_STATUS, TASK_TYPE } from "../../../../lib/types";
import { resolveWorkspaceId } from "../../../../lib/workspace-context";

const getEnv = (key: string) => {
  const value = process.env[key];
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

export async function POST(request: Request) {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) {
    return unauthorizedWithMessage("SLACK_SIGNING_SECRET not configured");
  }

  const raw = await request.text();
  const timestamp = request.headers.get("x-slack-request-timestamp") ?? "";
  const signature = request.headers.get("x-slack-signature") ?? "";

  if (!timestamp || !signature) {
    return unauthorizedWithMessage("missing slack headers");
  }
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > 60 * 5) {
    return unauthorizedWithMessage("request is too old");
  }
  try {
    const okSig = verifySlackSignature(signingSecret, raw, timestamp, signature);
    if (!okSig) return unauthorized();
  } catch {
    return unauthorized();
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
  const points = Number.isFinite(pointsNum) && pointsNum > 0 ? pointsNum : 3;
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

  const task = await prisma.task.create({
    data: {
      title,
      description: description ?? "",
      points,
      urgency: "中",
      risk: "中",
      status: TASK_STATUS.BACKLOG,
      type: TASK_TYPE.PBI,
      workspace: { connect: { id: workspaceId } },
      user: userEnv ? { connect: { id: userEnv } } : undefined,
    },
  });

  if (userEnv) {
    await applyAutomationForTask({
      userId: userEnv,
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

  return ok({
    response_type: "in_channel",
    text: `タスクを作成しました: ${title} (id: ${task.id}, workspace: ${workspaceId})`,
  });
}
