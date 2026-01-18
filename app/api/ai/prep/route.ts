import { AiPrepType } from "@prisma/client";
import { withApiHandler } from "../../../../lib/api-handler";
import { requireWorkspaceAuth } from "../../../../lib/api-guards";
import { ok } from "../../../../lib/api-response";
import { AiPrepSchema } from "../../../../lib/contracts/ai";
import { createDomainErrors } from "../../../../lib/http/errors";
import { parseBody } from "../../../../lib/http/validation";
import { requestAiChat } from "../../../../lib/ai-provider";
import prisma from "../../../../lib/prisma";

const prepPrompts: Record<
  string,
  {
    system: string;
    user: (title: string, description: string) => string;
    fallback: (title: string) => string;
  }
> = {
  EMAIL: {
    system: "あなたは丁寧で簡潔なメール作成アシスタントです。",
    user: (title, description) =>
      `次のタスクに関する短いメール草案を作成してください。件名と本文を含め、箇条書きは3点まで。\n\nタイトル: ${title}\n概要: ${description}`,
    fallback: (title) =>
      `件名: ${title} の共有\n\n関係者各位\n\n${title} について進めています。必要事項の確認をお願いします。\n- 目的/背景\n- 次のアクション\n- 期限\n\n以上、よろしくお願いします。`,
  },
  IMPLEMENTATION: {
    system: "あなたは実装計画の作成アシスタントです。",
    user: (title, description) =>
      `次のタスクの実装手順を5ステップ以内で作成してください。\n\nタイトル: ${title}\n概要: ${description}`,
    fallback: (title) =>
      `実装ステップ案\n1. ${title} の要件を整理\n2. 影響範囲を洗い出す\n3. 実装方針を決める\n4. 実装と自己テスト\n5. レビュー/確認`,
  },
  CHECKLIST: {
    system: "あなたはタスク実行のためのチェックリスト作成アシスタントです。",
    user: (title, description) =>
      `次のタスクを完了するためのチェックリストを作成してください。最大8項目。\n\nタイトル: ${title}\n概要: ${description}`,
    fallback: (title) =>
      `${title} のチェックリスト\n- 目的と完了条件を明確化\n- 必要な資料や依存を確認\n- 進め方を決める\n- 実行\n- 完了報告`,
  },
};

const isValidPrepType = (value: string): value is AiPrepType =>
  Object.keys(prepPrompts).includes(value);
const errors = createDomainErrors("AI");

export async function GET(request: Request) {
  return withApiHandler(
    {
      logLabel: "GET /api/ai/prep",
      errorFallback: {
        code: "AI_INTERNAL",
        message: "failed to load ai prep outputs",
        status: 500,
      },
    },
    async () => {
      const { userId, workspaceId } = await requireWorkspaceAuth();
      if (!workspaceId) {
        return ok({ outputs: [] });
      }
      const { searchParams } = new URL(request.url);
      const taskId = searchParams.get("taskId");
      if (!taskId) {
        return errors.badRequest("taskId is required");
      }
      const outputs = await prisma.aiPrepOutput.findMany({
        where: { taskId, workspaceId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          type: true,
          status: true,
          output: true,
          createdAt: true,
        },
      });
      return ok({ outputs });
    },
  );
}

export async function POST(request: Request) {
  return withApiHandler(
    {
      logLabel: "POST /api/ai/prep",
      errorFallback: {
        code: "AI_INTERNAL",
        message: "failed to generate ai prep output",
        status: 500,
      },
    },
    async () => {
      const { userId, workspaceId } = await requireWorkspaceAuth({
        domain: "AI",
        requireWorkspace: true,
      });
      const body = await parseBody(request, AiPrepSchema, { code: "AI_VALIDATION" });
      const taskId = body.taskId;
      const type = body.type;
      if (!isValidPrepType(type)) {
        return errors.badRequest("invalid type");
      }

      const task = await prisma.task.findFirst({
        where: { id: taskId, workspaceId },
        select: { id: true, title: true, description: true },
      });
      if (!task) {
        return errors.badRequest("invalid taskId");
      }

      const prompt = prepPrompts[type];
      let output = prompt.fallback(task.title);

      try {
        const result = await requestAiChat({
          system: prompt.system,
          user: prompt.user(task.title, task.description ?? ""),
          maxTokens: 220,
          context: {
            action: "AI_PREP",
            userId,
            workspaceId,
            taskId,
            source: `ai-prep:${type}`,
          },
        });
        if (result?.content) {
          output = result.content.trim();
        }
      } catch {
        // fall back to template
      }

      const saved = await prisma.aiPrepOutput.create({
        data: {
          taskId,
          type,
          output,
          userId,
          workspaceId,
        },
      });

      return ok({ output: saved });
    },
  );
}
