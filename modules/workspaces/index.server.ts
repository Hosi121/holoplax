import { createWorkspaceMemberCommands } from "./application/member-commands";
import { createWorkspaceAccess } from "./application/workspace-access";
import { createWorkspaceCommands } from "./application/workspace-commands";
import { prismaWorkspaceAccessPort } from "./infrastructure/prisma-workspace-access";
import { prismaWorkspaceCommandPort } from "./infrastructure/prisma-workspace-commands";
import { prismaWorkspaceMemberCommandPort } from "./infrastructure/prisma-workspace-member-commands";

const access = createWorkspaceAccess(prismaWorkspaceAccessPort);

export const isWorkspaceMember = access.isMember;
const memberCommands = createWorkspaceMemberCommands(prismaWorkspaceMemberCommandPort);
export const updateWorkspaceMemberRole = memberCommands.updateRole;
export const removeWorkspaceMember = memberCommands.remove;

const workspaceCommands = createWorkspaceCommands(prismaWorkspaceCommandPort);
export const listWorkspaces = workspaceCommands.list;
export const createWorkspace = workspaceCommands.create;
export const listWorkspaceMembers = workspaceCommands.listMembers;
export const addWorkspaceMember = workspaceCommands.addMember;
export const createWorkspaceInvite = workspaceCommands.createInvite;
export const acceptWorkspaceInvite = workspaceCommands.acceptInvite;
