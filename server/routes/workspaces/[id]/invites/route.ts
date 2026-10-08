import { requireAuth } from "../../../../../lib/api-auth";
import { requireWorkspaceManager } from "../../../../../lib/api-guards";
import { withApiHandler } from "../../../../../lib/api-handler";
import { ok } from "../../../../../lib/api-response";
import { WorkspaceInviteCreateSchema } from "../../../../../lib/contracts/workspace";
import { parseBody } from "../../../../../lib/http/validation";
import { createWorkspaceInvite } from "../../../../../modules/workspaces/index.server";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withApiHandler(
    {
      logLabel: "POST /api/workspaces/[id]/invites",
      errorFallback: {
        code: "WORKSPACE_INTERNAL",
        message: "failed to create invite",
        status: 500,
      },
    },
    async () => {
      const { userId } = await requireAuth();
      const { id } = await params;
      await requireWorkspaceManager("WORKSPACE", id, userId);
      const body = await parseBody(request, WorkspaceInviteCreateSchema, {
        code: "WORKSPACE_VALIDATION",
      });
      const email = body.email;
      const role = body.role ?? "member";

      return ok(await createWorkspaceInvite({ actorId: userId, workspaceId: id, email, role }));
    },
  );
}
