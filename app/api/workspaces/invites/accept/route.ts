import { requireAuth } from "../../../../../lib/api-auth";
import { withApiHandler } from "../../../../../lib/api-handler";
import { ok } from "../../../../../lib/api-response";
import { WorkspaceInviteAcceptSchema } from "../../../../../lib/contracts/workspace";
import { parseBody } from "../../../../../lib/http/validation";
import { acceptWorkspaceInvite } from "../../../../../modules/workspaces/index.server";

export async function POST(request: Request) {
  return withApiHandler(
    {
      logLabel: "POST /api/workspaces/invites/accept",
      errorFallback: {
        code: "WORKSPACE_INTERNAL",
        message: "failed to accept invite",
        status: 500,
      },
    },
    async () => {
      const { userId } = await requireAuth();
      const body = await parseBody(request, WorkspaceInviteAcceptSchema, {
        code: "WORKSPACE_VALIDATION",
      });
      const token = body.token;

      const { workspaceId } = await acceptWorkspaceInvite(userId, token);
      const response = ok({ ok: true, workspaceId });
      response.cookies.set("workspaceId", workspaceId, {
        path: "/",
        sameSite: "lax",
      });
      return response;
    },
  );
}
