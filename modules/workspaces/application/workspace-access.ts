export interface WorkspaceAccessPort {
  isMember(userId: string, workspaceId: string): Promise<boolean>;
}

export const createWorkspaceAccess = (port: WorkspaceAccessPort) => ({
  isMember: (userId: string, workspaceId: string) => port.isMember(userId, workspaceId),
});
