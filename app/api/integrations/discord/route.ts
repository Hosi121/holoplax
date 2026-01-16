import { badRequest, ok, unauthorized } from "../../../../lib/api-response";
import { applyAutomationForTask } from "../../../../lib/automation";
import { PENDING_APPROVAL_TAG } from "../../../../lib/automation-constants";
import prisma from "../../../../lib/prisma";
import { TASK_STATUS } from "../../../../lib/types";
import { resolveWorkspaceId } from "../../../../lib/workspace-context";

const headerToken = (request: Request) =>
  request.headers.get("x-integration-token") ??
  request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
  null;

const getEnv = (key: string) => process.env[key] ?? "";

export async function POST(request: Request) {
  const sharedToken = getEnv("DISCORD_INTEGRATION_TOKEN");
  if (!sharedToken) {
    return unauthorized();
  }
  const received = headerToken(request);
  if (!received || received !== sharedToken) {
    return unauthorized();
  }

  const body = await request.json().catch(() => ({}));
  const rawTitle = String(body.title ?? body.content ?? "").trim();
  const description = String(body.description ?? "").trim();
  const points = Number(body.points ?? 3);
  const urgency = String(body.urgency ?? "中");
  const risk = String(body.risk ?? "中");
  const userId = getEnv("DISCORD_USER_ID") || getEnv("INTEGRATION_USER_ID");
  const workspaceEnv = getEnv("DISCORD_WORKSPACE_ID");

  if (!rawTitle) {
    return badRequest("title is required");
  }

  const title = rawTitle.slice(0, 140);

  // workspace を決定（env > ユーザーのデフォルト）
  let workspaceId = workspaceEnv || null;
  if (!workspaceId && userId) {
    workspaceId = await resolveWorkspaceId(userId);
  }
  if (!workspaceId) {
    return badRequest("workspaceId not resolved; set DISCORD_WORKSPACE_ID or DISCORD_USER_ID");
  }

  const task = await prisma.task.create({
    data: {
      title,
      description,
      points: Number.isFinite(points) && points > 0 ? points : 3,
      urgency,
      risk,
      status: TASK_STATUS.BACKLOG,
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
}
