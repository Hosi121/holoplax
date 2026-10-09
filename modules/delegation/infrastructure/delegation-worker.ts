import { processDelegationJobs } from "../application/delegation-runner";
import { aiDelegationExecutor } from "./ai-delegation-executor";
import { d1DelegationQueuePort } from "./d1-delegation-queue";

export { notifyJobs as wakeDelegationWorker } from "../../../server/jobs";
export function runDelegationJobs(limit = 5) {
  return processDelegationJobs(d1DelegationQueuePort, aiDelegationExecutor, {
    workerId: crypto.randomUUID(),
    limit,
  });
}
