import { requireAuth } from "../../../../../lib/api-auth";
import { requireWorkspaceManager, requireWorkspaceMember } from "../../../../../lib/api-guards";
import { withApiHandler } from "../../../../../lib/api-handler";
import { ok } from "../../../../../lib/api-response";
import { WorkspaceMemberAddSchema } from "../../../../../lib/contracts/workspace";
import { parseBody } from "../../../../../lib/http/validation";
import {
  addWorkspaceMember,
  listWorkspaceMembers,
} from "../../../../../modules/workspaces/index.server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withApiHandler(
    {
      logLabel: "GET /api/workspaces/[id]/members",
      errorFallback: {
        code: "WORKSPACE_INTERNAL",
        message: "failed to load members",
        status: 500,
      },
    },
    async () => {
      const { userId } = await requireAuth();
      const { id } = await params;
      await requireWorkspaceMember("WORKSPACE", id, userId);
      return ok({ members: await listWorkspaceMembers(id) });
    },
  );
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return withApiHandler(
    {
      logLabel: "POST /api/workspaces/[id]/members",
      errorFallback: {
        code: "WORKSPACE_INTERNAL",
        message: "failed to add member",
        status: 500,
      },
    },
    async () => {
      const { userId } = await requireAuth();
      const { id } = await params;
      await requireWorkspaceManager("WORKSPACE", id, userId);

      const body = await parseBody(request, WorkspaceMemberAddSchema, {
        code: "WORKSPACE_VALIDATION",
      });
      const email = body.email;
      const role = body.role ?? "member";

      return ok({
        member: await addWorkspaceMember({ actorId: userId, workspaceId: id, email, role }),
      });
    },
  );
}
