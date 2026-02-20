import { withApiHandler } from "../../../../../lib/api-handler";
import { ok } from "../../../../../lib/api-response";
import { logAudit } from "../../../../../lib/audit";
import { applyAutomationForTask } from "../../../../../lib/automation";
import { DiscordCreateTaskSchema } from "../../../../../lib/contracts/integrations";
import { createDomainErrors } from "../../../../../lib/http/errors";
import { parseBody } from "../../../../../lib/http/validation";
import { validateSharedToken } from "../../../../../lib/integrations/auth";
import prisma from "../../../../../lib/prisma";
import { SEVERITY, type Severity, TASK_STATUS, TASK_TYPE } from "../../../../../lib/types";

const getEnv = (key: string) => {
  const value = process.env[key];
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

/**
 * Direct task creation API for Discord slash commands.
 * Unlike the intake endpoint, this creates tasks directly in the backlog.
 */
export async function POST(request: Request) {
  const errors = createDomainErrors("INTEGRATION");
  return withApiHandler(
    {
      logLabel: "POST /api/integrations/discord/task",
      errorFallback: {
        code: "INTEGRATION_INTERNAL",
        message: "failed to create task from discord",
        status: 500,
      },
    },
    async () => {
      // 1. Token authentication
      const authError = validateSharedToken(request, ["DISCORD_INTEGRATION_TOKEN"]);
      if (authError) return authError;

      // 2. Parse and validate body
      const body = await parseBody(request, DiscordCreateTaskSchema, {
        code: "INTEGRATION_VALIDATION",
        allowEmpty: false,
      });

      const title = String(body.title ?? "").trim();
      if (!title) {
        return errors.badRequest("title is required");
      }

      const description = String(body.description ?? "").trim();
      const author = String(body.author ?? "").trim();
      const channel = String(body.channel ?? "").trim();
      const threadId = String(body.threadId ?? "").trim();

      // Parse due date
      let dueDate: Date | null = null;
      if (body.dueDate) {
        const parsed = new Date(body.dueDate);
        if (!isNaN(parsed.getTime())) {
          dueDate = parsed;
        }
      }

      // Map urgency
      const urgencyMap: Record<string, Severity> = {
        LOW: SEVERITY.LOW,
        MEDIUM: SEVERITY.MEDIUM,
        HIGH: SEVERITY.HIGH,
      };
      const urgency: Severity = urgencyMap[body.urgency ?? "MEDIUM"] ?? SEVERITY.MEDIUM;

      // Validate points
      const validPoints = [1, 2, 3, 5, 8, 13];
      const points = validPoints.includes(body.points ?? 3) ? (body.points ?? 3) : 3;

      // Resolve user and workspace
      const userEnv = getEnv("DISCORD_USER_ID") || getEnv("INTEGRATION_USER_ID");
      const workspaceId = getEnv("DISCORD_WORKSPACE_ID") || getEnv("INTEGRATION_WORKSPACE_ID");

      if (!userEnv) {
        return errors.badRequest("userId not resolved; set DISCORD_USER_ID or INTEGRATION_USER_ID");
      }

      if (!workspaceId) {
        return errors.badRequest(
          "workspaceId not resolved; set DISCORD_WORKSPACE_ID or INTEGRATION_WORKSPACE_ID",
        );
      }

      // Build description with metadata
      const metaParts = [
        author && `by: ${author}`,
        channel && `ch: #${channel}`,
        threadId && `thread: ${threadId}`,
      ].filter(Boolean);
      const meta = metaParts.length > 0 ? `\n\n---\n${metaParts.join(" | ")}` : "";
      const fullDescription = description + meta;

      // 3. Create task directly in backlog
      const task = await prisma.task.create({
        data: {
          title: title.slice(0, 140),
          description: fullDescription,
          points,
          urgency,
          risk: SEVERITY.MEDIUM,
          status: TASK_STATUS.BACKLOG,
          type: TASK_TYPE.PBI,
          dueDate,
          workspace: { connect: { id: workspaceId } },
          user: { connect: { id: userEnv } },
        },
      });

      await logAudit({
        actorId: userEnv,
        action: "INTEGRATION_DISCORD_TASK_CREATE",
        targetWorkspaceId: workspaceId,
        metadata: { taskId: task.id, title: task.title, points: task.points, author, channel },
      });

      // 4. Apply automation rules
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

      // 5. Return task info
      return ok({
        taskId: task.id,
        title: task.title,
        points: task.points,
        urgency: task.urgency,
        dueDate: task.dueDate?.toISOString() ?? null,
        status: task.status,
      });
    },
  );
}
