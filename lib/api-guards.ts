import type { WorkspaceRole } from "@prisma/client";
import { requireAuth } from "./api-auth";
import { AppError } from "./http/errors";
import prisma from "./prisma";
import { resolveWorkspaceId } from "./workspace-context";

type WorkspaceAuthOptionsRequired = {
  domain?: string;
  requireWorkspace: true;
  message?: string;
};

type WorkspaceAuthOptionsOptional = {
  domain?: string;
  requireWorkspace?: false;
  message?: string;
};

type WorkspaceAuthOptions = WorkspaceAuthOptionsRequired | WorkspaceAuthOptionsOptional;

type AuthResult = Awaited<ReturnType<typeof requireAuth>>;

type WorkspaceAuthResultRequired = AuthResult & { workspaceId: string };
type WorkspaceAuthResultOptional = AuthResult & { workspaceId: string | null };

const forbid = (domain: string, message = "forbidden") => {
  throw new AppError(`${domain}_FORBIDDEN`, message, 403);
};

export async function requireWorkspaceAuth(
  options: WorkspaceAuthOptionsRequired,
): Promise<WorkspaceAuthResultRequired>;
export async function requireWorkspaceAuth(
  options?: WorkspaceAuthOptionsOptional,
): Promise<WorkspaceAuthResultOptional>;
export async function requireWorkspaceAuth(
  options: WorkspaceAuthOptions = {},
): Promise<WorkspaceAuthResultRequired | WorkspaceAuthResultOptional> {
  const auth = await requireAuth();
  const workspaceId = await resolveWorkspaceId(auth.userId);
  if (options.requireWorkspace && !workspaceId) {
    const domain = options.domain ?? "WORKSPACE";
    throw new AppError(`${domain}_BAD_REQUEST`, options.message ?? "workspace is required", 400);
  }
  return { ...auth, workspaceId } as WorkspaceAuthResultRequired | WorkspaceAuthResultOptional;
}

export const requireAdmin = async (domain = "ADMIN") => {
  const auth = await requireAuth();
  if (auth.role !== "ADMIN") {
    forbid(domain);
  }
  return auth;
};

const requireWorkspaceRole = async (
  domain: string,
  workspaceId: string,
  userId: string,
  roles: WorkspaceRole[],
) => {
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    select: { role: true },
  });
  if (!membership || !roles.includes(membership.role)) {
    forbid(domain);
  }
  return membership;
};

export const requireWorkspaceMember = async (domain: string, workspaceId: string, userId: string) =>
  requireWorkspaceRole(domain, workspaceId, userId, ["owner", "admin", "member"]);

export const requireWorkspaceManager = async (
  domain: string,
  workspaceId: string,
  userId: string,
) => requireWorkspaceRole(domain, workspaceId, userId, ["owner", "admin"]);
