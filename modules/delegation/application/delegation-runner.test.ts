import { describe, expect, it, vi } from "vitest";
import { type DelegationExecutionJob, processDelegationJobs } from "./delegation-runner";

const job: DelegationExecutionJob = {
  id: "job-1",
  request: "比較してまとめて",
  mode: "SAFE_AUTO",
  kind: "RESEARCH",
  plan: {
    kind: "RESEARCH",
    risk: "LOW",
    decision: { outcome: "AUTO" },
    steps: ["調べる"],
    completionCriteria: ["結論がある"],
  },
  attempts: 1,
  userId: "user-1",
  workspaceId: null,
};

describe("delegation runner", () => {
  it("completes a verified result", async () => {
    const queue = {
      recoverStale: vi.fn().mockResolvedValue(0),
      claimNext: vi.fn().mockResolvedValueOnce(job).mockResolvedValueOnce(null),
      complete: vi.fn().mockResolvedValue(true),
      requestInput: vi.fn(),
      fail: vi.fn(),
    };
    const executor = {
      execute: vi.fn().mockResolvedValue("完成した成果物"),
      verify: vi.fn().mockResolvedValue({
        passed: true,
        summary: "条件を満たしています",
        issues: [],
        method: "ai" as const,
      }),
    };

    await expect(processDelegationJobs(queue, executor, { workerId: "worker" })).resolves.toEqual({
      processed: 1,
      succeeded: 1,
      needsInput: 0,
      failed: 0,
    });
    expect(queue.complete).toHaveBeenCalledWith(
      "job-1",
      "worker",
      "完成した成果物",
      expect.objectContaining({ passed: true }),
    );
  });

  it("asks for input instead of claiming an unverified task is done", async () => {
    const queue = {
      recoverStale: vi.fn().mockResolvedValue(0),
      claimNext: vi.fn().mockResolvedValueOnce(job).mockResolvedValueOnce(null),
      complete: vi.fn(),
      requestInput: vi.fn().mockResolvedValue(true),
      fail: vi.fn(),
    };
    const executor = {
      execute: vi.fn().mockResolvedValue("不足のある成果物"),
      verify: vi.fn().mockResolvedValue({
        passed: false,
        summary: "追加情報が必要です",
        issues: ["対象期間が不明"],
        method: "ai" as const,
      }),
    };

    const result = await processDelegationJobs(queue, executor, { workerId: "worker" });
    expect(result.needsInput).toBe(1);
    expect(queue.complete).not.toHaveBeenCalled();
  });
});
