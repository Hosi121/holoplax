import crypto from "crypto";
import {
  badRequest,
  ok,
  unauthorized,
} from "../../../../lib/api-response";
import { applyAutomationForTask } from "../../../../lib/automation";
import prisma from "../../../../lib/prisma";
import { TASK_STATUS } from "../../../../lib/types";
import { resolveWorkspaceId } from "../../../../lib/workspace-context";

const getEnv = (key: string) => process.env[key] ?? "";

const verifySlackSignature = (secret: string, body: string, timestamp: string, signature: string) => {
  const base = `v0:${timestamp}:${body}`;
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(base);
  const expected = `v0=${hmac.digest("hex")}`;
  // constant-time compare
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
};

export async function POST(request: Request) {
  const signingSecret = getEnv("SLACK_SIGNING_SECRET");
  if (!signingSecret) {
    return unauthorized();
  }

  const raw = await request.text();
  const timestamp = request.headers.get("x-slack-request-timestamp") ?? "";
  const signature = request.headers.get("x-slack-signature") ?? "";

  if (!timestamp || !signature) {
    return unauthorized();
  }
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > 60 * 5) {
    return unauthorized();
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
