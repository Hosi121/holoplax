import type { DelegationJob, DelegationVerification } from "./delegation-types";

export type DelegationExecutionJob = Pick<
  DelegationJob,
  "id" | "request" | "mode" | "kind" | "plan" | "attempts"
> & {
  userId: string;
  workspaceId: string | null;
};

export interface DelegationQueuePort {
  recoverStale(): Promise<number>;
  claimNext(workerId: string): Promise<DelegationExecutionJob | null>;
  complete(
    jobId: string,
    workerId: string,
    result: string,
    verification: DelegationVerification,
  ): Promise<boolean>;
  requestInput(
    jobId: string,
    workerId: string,
    result: string,
    verification: DelegationVerification,
  ): Promise<boolean>;
  fail(job: DelegationExecutionJob, workerId: string, error: unknown): Promise<void>;
}

export interface DelegationExecutorPort {
  execute(job: DelegationExecutionJob): Promise<string>;
  verify(job: DelegationExecutionJob, result: string): Promise<DelegationVerification>;
}

export async function processDelegationJobs(
  queue: DelegationQueuePort,
  executor: DelegationExecutorPort,
  input: { workerId: string; limit?: number },
) {
  const limit = Math.min(20, Math.max(1, Math.trunc(input.limit ?? 5)));
  await queue.recoverStale();
  let processed = 0;
  let succeeded = 0;
  let needsInput = 0;
  let failed = 0;

  while (processed < limit) {
    const job = await queue.claimNext(input.workerId);
    if (!job) break;
    processed += 1;
    try {
      const result = await executor.execute(job);
      const verification = await executor.verify(job, result);
      if (verification.passed) {
        if (await queue.complete(job.id, input.workerId, result, verification)) succeeded += 1;
      } else if (await queue.requestInput(job.id, input.workerId, result, verification)) {
        needsInput += 1;
      }
    } catch (error) {
      failed += 1;
      await queue.fail(job, input.workerId, error);
    }
  }

  return { processed, succeeded, needsInput, failed };
}
