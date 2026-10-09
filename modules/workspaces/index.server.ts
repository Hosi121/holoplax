import { createWorkspaceMemberCommands } from "./application/member-commands";
import { createWorkspaceAccess } from "./application/workspace-access";
import { createWorkspaceCommands } from "./application/workspace-commands";
import { d1WorkspaceAccessPort } from "./infrastructure/d1-workspace-access";
import { d1WorkspaceCommandPort } from "./infrastructure/d1-workspace-commands";
import { d1WorkspaceMemberCommandPort } from "./infrastructure/d1-workspace-member-commands";

const access = createWorkspaceAccess(d1WorkspaceAccessPort);

export const isWorkspaceMember = access.isMember;
const memberCommands = createWorkspaceMemberCommands(d1WorkspaceMemberCommandPort);
export const updateWorkspaceMemberRole = memberCommands.updateRole;
export const removeWorkspaceMember = memberCommands.remove;

const workspaceCommands = createWorkspaceCommands(d1WorkspaceCommandPort);
export const listWorkspaces = workspaceCommands.list;
export const createWorkspace = workspaceCommands.create;
export const listWorkspaceMembers = workspaceCommands.listMembers;
export const addWorkspaceMember = workspaceCommands.addMember;
export const createWorkspaceInvite = workspaceCommands.createInvite;
export const acceptWorkspaceInvite = workspaceCommands.acceptInvite;
