import prisma from "./prisma";
import { generateSplitSuggestions } from "./ai-suggestions";
import { TASK_STATUS } from "./types";

const scoreFromPoints = (points: number) =>
  Math.min(100, Math.max(0, Math.round(points * 9)));

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
  if (task.status !== TASK_STATUS.BACKLOG) {
    return;
  }

  const thresholds = await prisma.userAutomationSetting.upsert({
    where: { userId_workspaceId: { userId, workspaceId } },
    update: {},
    create: { low: 35, high: 70, userId, workspaceId },
  });

  const score = scoreFromPoints(task.points);

  if (score < thresholds.low) {
    await prisma.aiSuggestion.create({
      data: {
        type: "TIP",
        taskId: task.id,
        inputTitle: task.title,
        inputDescription: task.description,
        output: "低スコアのため後回し候補。必要なら自動委任を検討。",
        userId,
        workspaceId,
      },
    });
    return;
  }

  const suggestions = await generateSplitSuggestions({
    title: task.title,
    description: task.description,
    points: task.points,
  });

  const prefix =
    score > thresholds.high ? "高スコア: 分割必須" : "中スコア: 分解提案";

  await prisma.aiSuggestion.create({
    data: {
      type: "SPLIT",
      taskId: task.id,
      inputTitle: task.title,
      inputDescription: task.description,
      output: JSON.stringify({ note: prefix, suggestions }),
      userId,
      workspaceId,
    },
  });
}
