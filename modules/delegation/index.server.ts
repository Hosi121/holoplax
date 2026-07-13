import { createDelegationCommands } from "./application/delegation-commands";
import { startDelegationWorker, wakeDelegationWorker } from "./infrastructure/delegation-worker";
import { prismaDelegationCommandPort } from "./infrastructure/prisma-delegation-commands";

const commands = createDelegationCommands(prismaDelegationCommandPort);

export const createDelegatedWork = async (...args: Parameters<typeof commands.create>) => {
  const job = await commands.create(...args);
  if (job.status === "PENDING") wakeDelegationWorker();
  return job;
};

export const listDelegatedWork = commands.list;

export const actOnDelegatedWork = async (...args: Parameters<typeof commands.act>) => {
  const job = await commands.act(...args);
  if (job.status === "PENDING") wakeDelegationWorker();
  return job;
};

export const startDurableDelegationWorker = startDelegationWorker;

export type {
  DelegationJob,
  DelegationJobStatus,
  DelegationVerification,
} from "./application/delegation-types";
export type { DelegationMode } from "./domain/delegation-policy";
