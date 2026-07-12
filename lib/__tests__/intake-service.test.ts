import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    intakeItem: { updateMany: vi.fn(), update: vi.fn() },
    task: { create: vi.fn() },
    $executeRaw: vi.fn(),
  };
  return {
    tx,
    intakeFindUnique: vi.fn(),
    intakeUpdateMany: vi.fn(),
    membershipFindUnique: vi.fn(),
    transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    logAudit: vi.fn(),
    applyAutomation: vi.fn(),
  };
});

vi.mock("../prisma", () => ({
  default: {
    intakeItem: {
      findUnique: mocks.intakeFindUnique,
      updateMany: mocks.intakeUpdateMany,
    },
    workspaceMember: { findUnique: mocks.membershipFindUnique },
    $transaction: mocks.transaction,
  },
}));
vi.mock("../audit", () => ({ logAudit: mocks.logAudit }));
vi.mock("../automation", () => ({ applyAutomationForTask: mocks.applyAutomation }));

import { resolveIntakeItem } from "../intake/intake-service";

const intakeItem = {
  id: "intake-1",
  userId: "user-1",
  workspaceId: "workspace-1",
  title: "Captured task",
  body: "Details",
  status: "PENDING",
};

describe("intake application service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.intakeFindUnique.mockResolvedValue(intakeItem);
    mocks.membershipFindUnique.mockResolvedValue({ workspaceId: "workspace-1" });
    mocks.logAudit.mockResolvedValue(undefined);
    mocks.applyAutomation.mockResolvedValue(undefined);
  });

  it("claims an intake item and creates a task with its initial status event atomically", async () => {
    mocks.tx.intakeItem.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.task.create.mockResolvedValue({
      id: "task-1",
      title: intakeItem.title,
      description: intakeItem.body,
      points: 3,
      status: "BACKLOG",
    });
    mocks.tx.intakeItem.update.mockResolvedValue({ count: 1 });

    await expect(
      resolveIntakeItem({
        userId: "user-1",
        input: { intakeId: "intake-1", action: "create", workspaceId: "workspace-1" },
      }),
    ).resolves.toEqual({ taskId: "task-1" });

    expect(mocks.tx.task.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        statusEvents: {
          create: expect.objectContaining({ toStatus: "BACKLOG", trigger: "API" }),
        },
      }),
    });
    expect(mocks.applyAutomation).toHaveBeenCalledOnce();
  });

  it("does not create a second task after the intake item was already claimed", async () => {
    mocks.tx.intakeItem.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      resolveIntakeItem({
        userId: "user-1",
        input: { intakeId: "intake-1", action: "create", workspaceId: "workspace-1" },
      }),
    ).rejects.toMatchObject({ code: "INTAKE_CONFLICT", status: 409 });
    expect(mocks.tx.task.create).not.toHaveBeenCalled();
    expect(mocks.applyAutomation).not.toHaveBeenCalled();
  });

  it("cannot dismiss an item after another resolution won", async () => {
    mocks.intakeUpdateMany.mockResolvedValue({ count: 0 });

    await expect(
      resolveIntakeItem({
        userId: "user-1",
        input: { intakeId: "intake-1", action: "dismiss" },
      }),
    ).rejects.toMatchObject({ code: "INTAKE_CONFLICT", status: 409 });
  });
});
