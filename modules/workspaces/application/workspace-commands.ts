import type { WorkspaceRole } from "../domain/workspace-types";

export type WorkspaceSummary = {
  id: string;
  name: string;
  ownerId: string;
  role: WorkspaceRole;
};

export type WorkspaceMemberView = {
  id: string;
  name: string | null;
  email: string | null;
  role: WorkspaceRole;
};

export interface WorkspaceCommandPort {
  list(userId: string): Promise<WorkspaceSummary[]>;
  create(
    userId: string,
    name: string,
  ): Promise<{
    id: string;
    name: string;
    ownerId: string;
    createdAt: Date;
  }>;
  listMembers(workspaceId: string): Promise<WorkspaceMemberView[]>;
  addMember(input: {
    actorId: string;
    workspaceId: string;
    email: string;
    role: WorkspaceRole;
  }): Promise<{ userId: string; workspaceId: string; role: WorkspaceRole; createdAt: Date }>;
  createInvite(input: {
    actorId: string;
    workspaceId: string;
    email: string;
    role: Exclude<WorkspaceRole, "owner">;
  }): Promise<{
    inviteUrl: string;
    invite: {
      id: string;
      workspaceId: string;
      email: string;
      role: WorkspaceRole;
      token: string;
      expiresAt: Date;
      acceptedAt: Date | null;
      createdAt: Date;
    };
  }>;
  acceptInvite(userId: string, token: string): Promise<{ workspaceId: string }>;
}

export const createWorkspaceCommands = (port: WorkspaceCommandPort) => ({
  list: (userId: string) => port.list(userId),
  create: (userId: string, name: string) => port.create(userId, name.trim()),
  listMembers: (workspaceId: string) => port.listMembers(workspaceId),
  addMember: (input: Parameters<WorkspaceCommandPort["addMember"]>[0]) => port.addMember(input),
  createInvite: (input: Parameters<WorkspaceCommandPort["createInvite"]>[0]) =>
    port.createInvite(input),
  acceptInvite: (userId: string, token: string) => port.acceptInvite(userId, token),
});
