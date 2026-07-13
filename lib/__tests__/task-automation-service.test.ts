import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const db = {
    task: { findFirst: vi.fn(), updateMany: vi.fn() },
    userAutomationSetting: { upsert: vi.fn() },
    aiSuggestion: { create: vi.fn() },
    aiPrepOutput: { deleteMany: vi.fn() },
  };
  return {
    db,
    transaction: vi.fn(async (callback: (tx: typeof db) => Promise<unknown>) => callback(db)),
    generatePrep: vi.fn(),
    generateSplit: vi.fn(),
  };
});

vi.mock("../prisma", () => ({
  default: { ...mocks.db, $transaction: mocks.transaction },
}));

vi.mock("../../modules/ai/index.server", () => ({
  generateAiPrep: mocks.generatePrep,
}));

vi.mock("../ai-suggestions", () => ({
  generateSplitSuggestions: mocks.generateSplit,
}));

import { applyAutomationForTask } from "../../modules/tasks/infrastructure/prisma-task-automation";

const currentTask = (points: number) => ({
  id: "task-1",
  title: "Implement feature",
  description: "",
  points,
  status: "BACKLOG",
  workflowState: "READY",
  tags: [],
  automationStatus: "NONE",
  hierarchyRole: "STANDARD",
});

describe("task automation execution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.db.task.updateMany.mockResolvedValue({ count: 1 });
    mocks.db.userAutomationSetting.upsert.mockResolvedValue({ low: 35, high: 70, stage: 0 });
    mocks.db.aiSuggestion.create.mockResolvedValue({ id: "suggestion-1" });
  });

  it("prepares low-point work exactly after claiming it", async () => {
    mocks.db.task.findFirst.mockResolvedValue(currentTask(1));
    mocks.generatePrep.mockResolvedValue({ id: "prep-1" });

    await applyAutomationForTask({
      userId: "user-1",
      workspaceId: "workspace-1",
      task: { id: "task-1", title: "stale", description: "", points: 1, status: "BACKLOG" },
    });

    expect(mocks.db.task.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ automationStatus: "NONE" }),
        data: expect.objectContaining({ automationStatus: "PREPARED" }),
      }),
    );
    expect(mocks.generatePrep).toHaveBeenCalledOnce();
    expect(mocks.db.aiSuggestion.create).toHaveBeenCalledOnce();
  });

  it("stores a reviewable split for medium-point work", async () => {
    mocks.db.task.findFirst.mockResolvedValue(currentTask(5));
    mocks.generateSplit.mockResolvedValue({
      suggestions: [{ title: "Part", detail: "", points: 3, urgency: "MEDIUM", risk: "MEDIUM" }],
    });

    await applyAutomationForTask({
      userId: "user-1",
      workspaceId: "workspace-1",
      task: { id: "task-1", title: "stale", description: "", points: 5, status: "BACKLOG" },
    });

    expect(mocks.db.task.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ automationStatus: "SPLIT_PENDING" }),
      }),
    );
    expect(mocks.db.aiSuggestion.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "SPLIT" }) }),
    );
  });
});
