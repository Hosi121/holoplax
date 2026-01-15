import { NextResponse } from "next/server";
import prisma from "../../../../lib/prisma";
import { TASK_STATUS } from "../../../../lib/types";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const { id } = params;
  const body = await request.json();
  const data: Record<string, unknown> = {};

  if (body.title) data.title = body.title;
  if (typeof body.description === "string") data.description = body.description;
  if (body.points) data.points = Number(body.points);
  if (body.urgency) data.urgency = body.urgency;
  if (body.risk) data.risk = body.risk;
  if (body.status && Object.values(TASK_STATUS).includes(body.status)) {
    data.status = body.status;
  }

  try {
    const updated = await prisma.task.update({
      where: { id },
      data,
    });
    return NextResponse.json({ task: updated });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
