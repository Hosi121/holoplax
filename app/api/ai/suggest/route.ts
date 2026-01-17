import { requireAuth } from "../../../../lib/api-auth";
import {
  badRequest,
  handleAuthError,
  ok,
  serverError,
} from "../../../../lib/api-response";
import prisma from "../../../../lib/prisma";
import { resolveWorkspaceId } from "../../../../lib/workspace-context";
import { buildAiUsageMetadata } from "../../../../lib/ai-usage";
import { logAudit } from "../../../../lib/audit";
import { requestAiChat } from "../../../../lib/ai-provider";

const canned = [
  "小さく分けて今日30分以内に終わる粒度にしてください。",
  "外部依存を先に洗い出し、リスクを下げるタスクを先頭に置きましょう。",
  "完了条件を1文で定義し、レビュー手順を添えましょう。",
];

export async function GET(request: Request) {
  try {
    const { userId } = await requireAuth();
    const workspaceId = await resolveWorkspaceId(userId);
    if (!workspaceId) {
      return ok({ suggestion: null });
    }
    const { searchParams } = new URL(request.url);
    const taskId = searchParams.get("taskId");
    if (!taskId) {
      return badRequest("taskId is required");
    }
    const latest = await prisma.aiSuggestion.findFirst({
      where: { taskId, workspaceId, type: "TIP" },
      orderBy: { createdAt: "desc" },
      select: { id: true, output: true },
    });
    return ok({ suggestion: latest?.output ?? null, suggestionId: latest?.id ?? null });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    console.error("GET /api/ai/suggest error", error);
    return serverError("failed to load suggestion");
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await requireAuth();
    const workspaceId = await resolveWorkspaceId(userId);
    if (!workspaceId) {
      return badRequest("workspace is required");
    }
    const body = await request.json();
    const title: string = body.title ?? "タスク";
    const description: string = body.description ?? "";
    const taskId: string | null = body.taskId ?? null;

    if (taskId) {
      const task = await prisma.task.findFirst({
        where: { id: taskId, workspaceId },
        select: { id: true },
      });
      if (!task) {
        return badRequest("invalid taskId");
      }
    }

    try {
      const result = await requestAiChat({
        system: "あなたはアジャイルなタスク分解のアシスタントです。",
        user: `タスクを短く分解し、緊急度や依存を意識した提案を1文でください: ${title}`,
        maxTokens: 80,
      });
      if (result) {
        const usageMeta = buildAiUsageMetadata(
          result.provider,
          result.model,
          result.usage,
        );
        if (usageMeta) {
          await logAudit({
            actorId: userId,
            action: "AI_SUGGEST",
            targetWorkspaceId: workspaceId,
            metadata: {
              ...usageMeta,
              taskId,
              source: "ai-suggest",
            },
          });
        }
      }
      if (result?.content) {
        const saved = await prisma.aiSuggestion.create({
          data: {
            type: "TIP",
            taskId,
            inputTitle: title,
            inputDescription: description,
            output: result.content,
            userId,
            workspaceId,
          },
        });
        return ok({ suggestion: result.content, suggestionId: saved.id });
      }
    } catch {
      // fall back to canned
    }

    const pick = canned[Math.floor(Math.random() * canned.length)];
    const saved = await prisma.aiSuggestion.create({
      data: {
        type: "TIP",
        taskId,
        inputTitle: title,
        inputDescription: description,
        output: pick,
        userId,
        workspaceId,
      },
    });
    return ok({ suggestion: `${title} のAI提案: ${pick}`, suggestionId: saved.id });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    console.error("POST /api/ai/suggest error", error);
    return serverError("failed to generate suggestion");
  }
}
