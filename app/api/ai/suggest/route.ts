import { requireAuth } from "../../../../lib/api-auth";
import {
  badRequest,
  handleAuthError,
  ok,
  serverError,
} from "../../../../lib/api-response";
import prisma from "../../../../lib/prisma";
import { resolveWorkspaceId } from "../../../../lib/workspace-context";

const canned = [
  "小さく分けて今日30分以内に終わる粒度にしてください。",
  "外部依存を先に洗い出し、リスクを下げるタスクを先頭に置きましょう。",
  "完了条件を1文で定義し、レビュー手順を添えましょう。",
];

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

    const apiKey = process.env.OPENAI_API_KEY;
    if (apiKey) {
      try {
        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: "あなたはアジャイルなタスク分解のアシスタントです。" },
              {
                role: "user",
                content: `タスクを短く分解し、緊急度や依存を意識した提案を1文でください: ${title}`,
              },
            ],
            max_tokens: 80,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const content = data.choices?.[0]?.message?.content;
          if (content) {
          await prisma.aiSuggestion.create({
            data: {
              type: "TIP",
              taskId,
              inputTitle: title,
              inputDescription: description,
              output: content,
              userId,
              workspaceId,
            },
          });
            return ok({ suggestion: content });
          }
        }
      } catch {
        // fall back to canned
      }
    }

    const pick = canned[Math.floor(Math.random() * canned.length)];
  await prisma.aiSuggestion.create({
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
  return ok({ suggestion: `${title} のAI提案: ${pick}` });
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    console.error("POST /api/ai/suggest error", error);
    return serverError("failed to generate suggestion");
  }
}
