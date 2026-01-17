import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireAuth } from "../../../../lib/api-auth";
import { handleAuthError, ok, serverError, badRequest, forbidden } from "../../../../lib/api-response";
import prisma from "../../../../lib/prisma";

export async function GET() {
  try {
    const { userId } = await requireAuth();
    const memberships = await prisma.workspaceMember.findMany({
      where: { userId },
      select: {
        role: true,
        workspaceId: true,
        workspace: { select: { id: true, name: true, ownerId: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    const workspaces = memberships.map((m) => ({
      id: m.workspace.id,
      name: m.workspace.name,
      role: m.role,
      ownerId: m.workspace.ownerId,
    }));

    const cookieStore = await cookies();
    const preferred = cookieStore.get("workspaceId")?.value ?? null;
    const hasPreferred = preferred
      ? memberships.some((m) => m.workspaceId === preferred)
      : false;
    const currentWorkspaceId = hasPreferred
      ? preferred
      : workspaces[0]?.id ?? null;

    const response = ok({ currentWorkspaceId, workspaces });
    if (currentWorkspaceId && currentWorkspaceId !== preferred) {
      response.cookies.set("workspaceId", currentWorkspaceId, {
        path: "/",
        sameSite: "lax",
      });
    }
    return response;
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    console.error("GET /api/workspaces/current error", error);
    return serverError("failed to load workspace context");
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await requireAuth();
    const body = await request.json();
    const workspaceId = String(body.workspaceId ?? "").trim();
    if (!workspaceId) {
      return badRequest("workspaceId is required");
    }
    const membership = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { workspaceId: true },
    });
    if (!membership) {
      return forbidden();
    }
    const response = NextResponse.json({ ok: true });
    response.cookies.set("workspaceId", workspaceId, {
      path: "/",
      sameSite: "lax",
    });
    return response;
  } catch (error) {
    const authError = handleAuthError(error);
    if (authError) return authError;
    console.error("POST /api/workspaces/current error", error);
    return serverError("failed to update workspace context");
  }
}
