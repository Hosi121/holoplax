import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    workspace: { findUnique: vi.fn(), updateMany: vi.fn() },
    workspaceMember: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    auditLog: { create: vi.fn() },
  };
  return {
    tx,
    transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
  };
});

vi.mock("../prisma", () => ({
  default: { $transaction: mocks.transaction },
}));

import {
  removeWorkspaceMember,
  updateWorkspaceMemberRole,
} from "../../modules/workspaces/infrastructure/prisma-workspace-member-commands";

const params = {
  actorId: "owner-1",
  workspaceId: "workspace-1",
  targetUserId: "member-1",
};

describe("workspace member application service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.tx.workspace.findUnique.mockResolvedValue({ ownerId: "owner-1" });
    mocks.tx.workspaceMember.findUnique.mockResolvedValue({ role: "member" });
    mocks.tx.auditLog.create.mockResolvedValue({ id: "audit-1" });
  });

  it("transfers ownership only after atomically claiming the current ownership", async () => {
    mocks.tx.workspace.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.workspaceMember.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.workspaceMember.update.mockResolvedValue({
      userId: "member-1",
      workspaceId: "workspace-1",
      role: "owner",
    });

    await expect(updateWorkspaceMemberRole({ ...params, role: "owner" })).resolves.toMatchObject({
      role: "owner",
    });

    expect(mocks.tx.workspace.updateMany).toHaveBeenCalledWith({
      where: { id: "workspace-1", ownerId: "owner-1" },
      data: { ownerId: "member-1" },
    });
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "WORKSPACE_OWNERSHIP_TRANSFER",
        metadata: { previousOwnerId: "owner-1" },
      }),
    });
  });

  it("rejects a transfer when a concurrent request already changed the owner", async () => {
    mocks.tx.workspace.updateMany.mockResolvedValue({ count: 0 });

    await expect(updateWorkspaceMemberRole({ ...params, role: "owner" })).rejects.toMatchObject({
      code: "WORKSPACE_CONFLICT",
      kind: "conflict",
    });
    expect(mocks.tx.workspaceMember.update).not.toHaveBeenCalled();
    expect(mocks.tx.auditLog.create).not.toHaveBeenCalled();
  });

  it("does not allow removing the canonical workspace owner", async () => {
    mocks.tx.workspace.findUnique.mockResolvedValue({ ownerId: "member-1" });

    await expect(removeWorkspaceMember(params)).rejects.toMatchObject({
      code: "WORKSPACE_CONFLICT",
      kind: "conflict",
    });
    expect(mocks.tx.workspaceMember.delete).not.toHaveBeenCalled();
    expect(mocks.tx.auditLog.create).not.toHaveBeenCalled();
  });
});
