import type { WorkspaceRole } from "../domain/workspace-types";

export type WorkspaceMemberRecord = {
  userId: string;
  workspaceId: string;
  role: WorkspaceRole;
};

export type WorkspaceMemberActor = {
  actorId: string;
  workspaceId: string;
  targetUserId: string;
};

export interface WorkspaceMemberCommandPort {
  updateRole(actor: WorkspaceMemberActor, role: WorkspaceRole): Promise<WorkspaceMemberRecord>;
  remove(actor: WorkspaceMemberActor): Promise<void>;
}

export const createWorkspaceMemberCommands = (port: WorkspaceMemberCommandPort) => ({
  updateRole: (actor: WorkspaceMemberActor, role: WorkspaceRole) => port.updateRole(actor, role),
  remove: (actor: WorkspaceMemberActor) => port.remove(actor),
});
