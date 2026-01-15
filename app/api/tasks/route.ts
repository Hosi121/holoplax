import { NextResponse } from "next/server";
import prisma from "../../../lib/prisma";
import { TASK_STATUS } from "../../../lib/types";

export async function GET() {
  const tasks = await prisma.task.findMany({
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ tasks });
}

export async function POST(request: Request) {
  const body = await request.json();
  const { title, description, points, urgency, risk, status } = body;
  if (!title || points === undefined || points === null) {
    return NextResponse.json({ error: "title and points are required" }, { status: 400 });
  }
  const statusValue = Object.values(TASK_STATUS).includes(status)
    ? status
    : TASK_STATUS.BACKLOG;
  const task = await prisma.task.create({
    data: {
      title,
      description: description ?? "",
      points: Number(points),
      urgency: urgency ?? "中",
      risk: risk ?? "中",
      status: statusValue,
    },
  });
  return NextResponse.json({ task });
}
