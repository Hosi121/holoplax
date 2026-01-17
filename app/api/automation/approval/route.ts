import { requireAuth } from "../../../../lib/api-auth";
import {
  badRequest,
  handleAuthError,
  notFound,
  ok,
  serverError,
} from "../../../../lib/api-response";
import { generateSplitSuggestions } from "../../../../lib/ai-suggestions";
import { buildAiUsageMetadata } from "../../../../lib/ai-usage";
import {
  PENDING_APPROVAL_TAG,
  SPLIT_REJECTED_TAG,
  SPLIT_CHILD_TAG,
  SPLIT_PARENT_TAG,
  withTag,
  withoutTags,
} from "../../../../lib/automation-constants";
import prisma from "../../../../lib/prisma";
import { TASK_STATUS, TASK_TYPE } from "../../../../lib/types";
import { resolveWorkspaceId } from "../../../../lib/workspace-context";
import { logAudit } from "../../../../lib/audit";

type SplitSuggestion = {
  title: string;
  points: number;
  urgency?: string;
  risk?: string;
  detail?: string;
};

const parseSuggestions = (output: string | null, fallback: SplitSuggestion[]) => {
  if (!output) return fallback;
  try {
    const parsed = JSON.parse(output);
    if (Array.isArray(parsed)) return parsed as SplitSuggestion[];
    if (Array.isArray(parsed?.suggestions)) return parsed.suggestions as SplitSuggestion[];
  } catch {
    // ignore
  }
  return fallback;
};

export async function POST(request: Request) {
  try {
    const { userId } = await requireAuth();
    const workspaceId = await resolveWorkspaceId(userId);
    if (!workspaceId) {
      return badRequest("workspace is required");
    }

    const body = await request.json().catch(() => ({}));
    const taskId = String(body.taskId ?? "");
    const action = String(body.action ?? "").toLowerCase();
    if (!taskId || !["approve", "reject"].includes(action)) {
      return badRequest("taskId and action (approve|reject) are required");
    }

    const task = await prisma.task.findFirst({
      where: { id: taskId, workspaceId },
      select: {
        id: true,
        title: true,
        description: true,
        points: true,
        urgency: true,
        risk: true,
        tags: true,
      },
    });
    if (!task) return notFound("task not found");

    if (action === "reject") {
      const nextTags = withTag(
        withoutTags(task.tags ?? [], [PENDING_APPROVAL_TAG, SPLIT_PARENT_TAG]),
        SPLIT_REJECTED_TAG,
      );
      await prisma.task.update({
        where: { id: task.id },
        data: { tags: nextTags },
      });
      return ok({ status: "rejected" });
    }

    // approve path
    if (task.tags?.includes(SPLIT_PARENT_TAG)) {
      return ok({ status: "already-approved", created: 0 });
    }
    if (!task.tags?.includes(PENDING_APPROVAL_TAG)) {
      return ok({ status: "no-pending", created: 0 });
    }

    const latest = await prisma.aiSuggestion.findFirst({
      where: { taskId: task.id, workspaceId, type: "SPLIT" },
      orderBy: { createdAt: "desc" },
      select: { output: true },
    });

    const fallbackResult = await generateSplitSuggestions({
      title: task.title,
      description: task.description ?? "",
      points: task.points,
    });
    const suggestions = parseSuggestions(
      latest?.output ?? null,
      fallbackResult.suggestions,
    );
    const usageMeta = buildAiUsageMetadata(
      fallbackResult.model,
      fallbackResult.usage,
    );
    if (usageMeta) {
      await logAudit({
        actorId: userId,
        action: "AI_SPLIT",
        targetWorkspaceId: workspaceId,
        metadata: {
          ...usageMeta,
          taskId: task.id,
          source: "approval",
        },
      });
    }

    await prisma.$transaction(async (tx) => {
      const nextTags = withTag(
        withoutTags(task.tags ?? [], [PENDING_APPROVAL_TAG, SPLIT_REJECTED_TAG]),
        SPLIT_PARENT_TAG,
      );
      await tx.task.update({
        where: { id: task.id },
        data: { tags: nextTags },
      });

      await Promise.all(
        suggestions.map((item) =>
          tx.task.create({
            data: {
              title: item.title,
              description: item.detail ?? "",
              points: Number(item.points) || 1,
              urgency: item.urgency ?? "中",
              risk: item.risk ?? "中",
              status: TASK_STATUS.BACKLOG,
              tags: withTag([], SPLIT_CHILD_TAG),
              type: TASK_TYPE.TASK,
              parentId: task.id,
              workspace: { connect: { id: workspaceId } },
              user: { connect: { id: userId } },
            },
          }),
        ),
      );
    });

    return ok({ status: "approved", created: suggestions.length });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    console.error("POST /api/automation/approval error", error);
    return serverError("failed to process approval");
  }
}
