import { requireAuth } from "../../../lib/api-auth";
import { withApiHandler } from "../../../lib/api-handler";
import { ok } from "../../../lib/api-response";
import { WorkspaceCreateSchema } from "../../../lib/contracts/workspace";
import { parseBody } from "../../../lib/http/validation";
import { createWorkspace, listWorkspaces } from "../../../modules/workspaces/index.server";

export async function GET() {
  return withApiHandler(
    {
      logLabel: "GET /api/workspaces",
      errorFallback: {
        code: "WORKSPACE_INTERNAL",
        message: "failed to load workspaces",
        status: 500,
      },
    },
    async () => {
      const { userId } = await requireAuth();
      return ok({ workspaces: await listWorkspaces(userId) });
    },
  );
}

export async function POST(request: Request) {
  return withApiHandler(
    {
      logLabel: "POST /api/workspaces",
      errorFallback: {
        code: "WORKSPACE_INTERNAL",
        message: "failed to create workspace",
        status: 500,
      },
    },
    async () => {
      const { userId } = await requireAuth();
      const body = await parseBody(request, WorkspaceCreateSchema, {
        code: "WORKSPACE_VALIDATION",
      });
      const name = body.name;
      const workspace = await createWorkspace(userId, name);
      return ok({ workspace });
    },
  );
}
