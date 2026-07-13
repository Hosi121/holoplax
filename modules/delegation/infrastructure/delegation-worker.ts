import { randomUUID } from "crypto";
import { logger } from "../../../lib/logger";
import { processDelegationJobs } from "../application/delegation-runner";
import { aiDelegationExecutor } from "./ai-delegation-executor";
import { prismaDelegationQueuePort } from "./prisma-delegation-queue";

type WorkerState = {
  timer: ReturnType<typeof setInterval> | null;
  running: boolean;
  wakeRequested: boolean;
  tick: () => Promise<void>;
};

const workerGlobal = globalThis as typeof globalThis & {
  __holoplaxDelegationWorker?: WorkerState;
};

export const startDelegationWorker = (
  intervalMs = Number(process.env.DELEGATION_WORKER_INTERVAL_MS ?? "10000"),
) => {
  const existing = workerGlobal.__holoplaxDelegationWorker;
  if (existing?.timer) return () => undefined;
  const state = {} as WorkerState;
  const tick = async () => {
    if (state.running) {
      state.wakeRequested = true;
      return;
    }
    state.running = true;
    try {
      await processDelegationJobs(prismaDelegationQueuePort, aiDelegationExecutor, {
        workerId: randomUUID(),
        limit: 10,
      });
    } catch (error) {
      logger.error("DELEGATION_WORKER poll failed", {}, error);
    } finally {
      state.running = false;
      if (state.wakeRequested) {
        state.wakeRequested = false;
        queueMicrotask(() => void tick());
      }
    }
  };
  Object.assign(state, { timer: null, running: false, wakeRequested: false, tick });
  state.timer = setInterval(() => void tick(), Math.max(5_000, intervalMs));
  state.timer.unref();
  workerGlobal.__holoplaxDelegationWorker = state;
  void tick();

  return () => {
    if (state.timer) clearInterval(state.timer);
    state.timer = null;
    if (workerGlobal.__holoplaxDelegationWorker === state) {
      delete workerGlobal.__holoplaxDelegationWorker;
    }
  };
};

export const wakeDelegationWorker = () => {
  const state = workerGlobal.__holoplaxDelegationWorker;
  if (state) void state.tick();
};
