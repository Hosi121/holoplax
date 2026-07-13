import type { AiPrepType } from "@prisma/client";
import { requestAiChat } from "./ai-provider";
import prisma from "./prisma";

export const prepPrompts: Record<
  AiPrepType,
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

export const isValidPrepType = (value: string): value is AiPrepType => value in prepPrompts;

export async function generateAndSaveAiPrep(params: {
  type: AiPrepType;
  task: { id: string; title: string; description: string | null };
  userId: string;
  workspaceId: string;
  source?: string;
}) {
  const prompt = prepPrompts[params.type];
  let output = prompt.fallback(params.task.title);
  try {
    const result = await requestAiChat({
      system: prompt.system,
      user: prompt.user(params.task.title, params.task.description ?? ""),
      maxTokens: 220,
      context: {
        action: "AI_PREP",
        userId: params.userId,
        workspaceId: params.workspaceId,
        taskId: params.task.id,
        source: params.source ?? `ai-prep:${params.type}`,
      },
    });
    if (result?.content) output = result.content.trim();
  } catch {
    // Provider failures degrade to a useful local template.
  }
  return prisma.aiPrepOutput.create({
    data: {
      taskId: params.task.id,
      type: params.type,
      output,
      userId: params.userId,
      workspaceId: params.workspaceId,
    },
  });
}
