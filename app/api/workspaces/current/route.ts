import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireAuth } from "../../../../lib/api-auth";
import { withApiHandler } from "../../../../lib/api-handler";
import { ok } from "../../../../lib/api-response";
import { WorkspaceCurrentSchema } from "../../../../lib/contracts/workspace";
import { createDomainErrors } from "../../../../lib/http/errors";
import { parseBody } from "../../../../lib/http/validation";
import { isWorkspaceMember, listWorkspaces } from "../../../../modules/workspaces/index.server";

const errors = createDomainErrors("WORKSPACE");

export async function GET() {
  return withApiHandler(
    {
      logLabel: "GET /api/workspaces/current",
      errorFallback: {
        code: "WORKSPACE_INTERNAL",
        message: "failed to load workspace context",
        status: 500,
      },
    },
    async () => {
      const { userId } = await requireAuth();
      const workspaces = await listWorkspaces(userId);

      const cookieStore = await cookies();
      const preferred = cookieStore.get("workspaceId")?.value ?? null;
      const hasPreferred = preferred ? workspaces.some(({ id }) => id === preferred) : false;
      const currentWorkspaceId = hasPreferred ? preferred : (workspaces[0]?.id ?? null);

      const response = ok({ currentWorkspaceId, workspaces });
      if (currentWorkspaceId && currentWorkspaceId !== preferred) {
        response.cookies.set("workspaceId", currentWorkspaceId, {
          path: "/",
          sameSite: "lax",
        });
      }
      return response;
    },
  );
}

export async function POST(request: Request) {
  return withApiHandler(
    {
      logLabel: "POST /api/workspaces/current",
      errorFallback: {
        code: "WORKSPACE_INTERNAL",
        message: "failed to update workspace context",
        status: 500,
      },
    },
    async () => {
      const { userId } = await requireAuth();
      const body = await parseBody(request, WorkspaceCurrentSchema, {
        code: "WORKSPACE_VALIDATION",
      });
      const workspaceId = body.workspaceId;
      if (!(await isWorkspaceMember(userId, workspaceId))) {
        return errors.forbidden();
      }
      const response = NextResponse.json({ ok: true });
      response.cookies.set("workspaceId", workspaceId, {
        path: "/",
        sameSite: "lax",
      });
      return response;
    },
  );
}
