import prisma from "./prisma";
import { generateSplitSuggestions } from "./ai-suggestions";
import { TASK_STATUS } from "./types";

const scoreFromPoints = (points: number) =>
  Math.min(100, Math.max(0, Math.round(points * 9)));

const DELEGATE_TAG = "auto-delegate";
const SPLIT_PARENT_TAG = "auto-split-parent";
const SPLIT_CHILD_TAG = "auto-split-child";
const PENDING_APPROVAL_TAG = "automation-needs-approval";

const withTag = (tags: string[], tag: string) => {
  const set = new Set(tags ?? []);
  set.add(tag);
  return Array.from(set);
};

const requireApproval = process.env.AUTOMATION_REQUIRE_APPROVAL === "true";

export async function applyAutomationForTask(params: {
  userId: string;
  workspaceId: string;
  task: {
    id: string;
    title: string;
    description: string;
    points: number;
    status: string;
  };
}) {
  const { userId, workspaceId, task } = params;
  const current = await prisma.task.findFirst({
    where: { id: task.id, workspaceId },
    select: {
      id: true,
      title: true,
      description: true,
      points: true,
      status: true,
      tags: true,
    },
  });
  if (!current || current.status !== TASK_STATUS.BACKLOG) {
    return;
  }

  const thresholds = await prisma.userAutomationSetting.upsert({
    where: { userId_workspaceId: { userId, workspaceId } },
    update: {},
    create: { low: 35, high: 70, userId, workspaceId },
  });

  const score = scoreFromPoints(current.points);

  if (score < thresholds.low) {
    await prisma.task.update({
      where: { id: current.id },
      data: {
        tags: withTag(current.tags ?? [], DELEGATE_TAG),
      },
    });
    await prisma.aiSuggestion.create({
      data: {
        type: "TIP",
        taskId: current.id,
        inputTitle: current.title,
        inputDescription: current.description,
        output: requireApproval
          ? "低スコア: AI委任候補（承認待ち）。AI委任キューに移動しました。"
          : "低スコア: AI委任候補。AI委任キューに移動しました。",
        userId,
        workspaceId,
      },
    });
    return;
  }

  const suggestions = await generateSplitSuggestions({
    title: current.title,
    description: current.description,
    points: current.points,
  });

  const prefix =
    score > thresholds.high ? "高スコア: 分割必須" : "中スコア: 分解提案";

  // 中スコア帯は従来通りログのみ
  if (score <= thresholds.high) {
    await prisma.aiSuggestion.create({
      data: {
        type: "SPLIT",
        taskId: current.id,
        inputTitle: current.title,
        inputDescription: current.description,
        output: JSON.stringify({ note: prefix, suggestions }),
        userId,
        workspaceId,
      },
    });
    return;
  }

  // 高スコア帯: 自動分解（承認モードなら保留タグだけ付ける）
  if (current.tags?.includes(SPLIT_PARENT_TAG)) {
    return; // 二重分解を防ぐ
  }

  if (requireApproval) {
    await prisma.task.update({
      where: { id: current.id },
      data: {
        tags: withTag(withTag(current.tags ?? [], SPLIT_PARENT_TAG), PENDING_APPROVAL_TAG),
      },
    });
    await prisma.aiSuggestion.create({
      data: {
        type: "SPLIT",
        taskId: current.id,
        inputTitle: current.title,
        inputDescription: current.description,
        output: JSON.stringify({ note: `${prefix}（承認待ち）`, suggestions }),
        userId,
        workspaceId,
      },
    });
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.task.update({
      where: { id: current.id },
      data: {
        tags: withTag(current.tags ?? [], SPLIT_PARENT_TAG),
      },
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
            workspace: { connect: { id: workspaceId } },
            user: { connect: { id: userId } },
          },
        }),
      ),
    );

    await tx.aiSuggestion.create({
      data: {
        type: "SPLIT",
        taskId: current.id,
        inputTitle: current.title,
        inputDescription: current.description,
        output: JSON.stringify({ note: `${prefix}（自動分解実行）`, suggestions }),
        userId,
        workspaceId,
      },
    });
  });
}
