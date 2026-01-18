import { requireAuth } from "../../../../lib/api-auth";
import { withApiHandler } from "../../../../lib/api-handler";
import { ok } from "../../../../lib/api-response";
import { AiSuggestSchema } from "../../../../lib/contracts/ai";
import { createDomainErrors } from "../../../../lib/http/errors";
import { parseBody } from "../../../../lib/http/validation";
import prisma from "../../../../lib/prisma";
import { resolveWorkspaceId } from "../../../../lib/workspace-context";
import { requestAiChat } from "../../../../lib/ai-provider";

const canned = [
  "小さく分けて今日30分以内に終わる粒度にしてください。",
  "外部依存を先に洗い出し、リスクを下げるタスクを先頭に置きましょう。",
  "完了条件を1文で定義し、レビュー手順を添えましょう。",
];
const errors = createDomainErrors("AI");

export async function GET(request: Request) {
  return withApiHandler(
    {
      logLabel: "GET /api/ai/suggest",
      errorFallback: {
        code: "AI_INTERNAL",
        message: "failed to load suggestion",
        status: 500,
      },
    },
    async () => {
      const { userId } = await requireAuth();
      const workspaceId = await resolveWorkspaceId(userId);
      if (!workspaceId) {
        return ok({ suggestion: null });
      }
      const { searchParams } = new URL(request.url);
      const taskId = searchParams.get("taskId");
      if (!taskId) {
        return errors.badRequest("taskId is required");
      }
      const latest = await prisma.aiSuggestion.findFirst({
        where: { taskId, workspaceId, type: "TIP" },
        orderBy: { createdAt: "desc" },
        select: { id: true, output: true },
      });
      return ok({ suggestion: latest?.output ?? null, suggestionId: latest?.id ?? null });
    },
  );
}

export async function POST(request: Request) {
  return withApiHandler(
    {
      logLabel: "POST /api/ai/suggest",
      errorFallback: {
        code: "AI_INTERNAL",
        message: "failed to generate suggestion",
        status: 500,
      },
    },
    async () => {
      const { userId } = await requireAuth();
      const workspaceId = await resolveWorkspaceId(userId);
      if (!workspaceId) {
        return errors.badRequest("workspace is required");
      }
      const body = await parseBody(request, AiSuggestSchema, { code: "AI_VALIDATION" });
      const title = body.title ?? "タスク";
      const description = body.description ?? "";
      const taskId = body.taskId ?? null;

      if (taskId) {
        const task = await prisma.task.findFirst({
          where: { id: taskId, workspaceId },
          select: { id: true },
        });
        if (!task) {
          return errors.badRequest("invalid taskId");
        }
      }

      try {
        const result = await requestAiChat({
          system: "あなたはアジャイルなタスク分解のアシスタントです。",
          user: `タスクを短く分解し、緊急度や依存を意識した提案を1文でください: ${title}`,
          maxTokens: 80,
          context: {
            action: "AI_SUGGEST",
            userId,
            workspaceId,
            taskId,
            source: "ai-suggest",
          },
        });
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
    },
  );
}
