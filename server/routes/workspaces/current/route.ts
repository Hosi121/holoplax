import { requireAuth } from "../../../../lib/api-auth";
import { requireWorkspaceAuth } from "../../../../lib/api-guards";
import { withApiHandler } from "../../../../lib/api-handler";
import { ok } from "../../../../lib/api-response";
import { WorkspaceCurrentSchema } from "../../../../lib/contracts/workspace";
import { createDomainErrors } from "../../../../lib/http/errors";
import { parseBody } from "../../../../lib/http/validation";
import { isWorkspaceMember, listWorkspaces } from "../../../../modules/workspaces/index.server";
import { getRequestCookie, setResponseCookie } from "../../../../server/request-context";

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
      const { userId, workspaceId: currentWorkspaceId } = await requireWorkspaceAuth();
      const workspaces = await listWorkspaces(userId);

      const preferred = getRequestCookie("workspaceId");
      const response = ok({ currentWorkspaceId, workspaces });
      if (currentWorkspaceId && currentWorkspaceId !== preferred) {
        setResponseCookie(response, "workspaceId", currentWorkspaceId, {
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
      const response = Response.json({ ok: true });
      setResponseCookie(response, "workspaceId", workspaceId, {
        path: "/",
        sameSite: "lax",
      });
      return response;
    },
  );
}
