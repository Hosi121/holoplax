import prisma from "./prisma";
import { diceCoefficient } from "./text-similarity";

const MAX_DUPLICATES = 5;
const SIMILARITY_THRESHOLD = 0.35;

export function deriveIntakeTitle(text: string) {
  const trimmed = text.trim();
  if (!trimmed) return "無題メモ";
  const firstLine = trimmed.split(/\r?\n/)[0].trim();
  return firstLine.length > 80 ? `${firstLine.slice(0, 77)}...` : firstLine;
}

export async function findDuplicateTasks(params: {
  workspaceId: string;
  title: string;
  limit?: number;
}) {
  const { workspaceId, title, limit = MAX_DUPLICATES } = params;
  const tasks = await prisma.task.findMany({
    where: { workspaceId },
    select: { id: true, title: true, status: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const scored = tasks
    .map((task) => ({
      ...task,
      score: diceCoefficient(title, task.title),
    }))
    .filter((item) => item.score >= SIMILARITY_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return scored;
}
