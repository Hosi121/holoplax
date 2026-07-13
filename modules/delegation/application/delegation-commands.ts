import { ApplicationError } from "../../shared/application/application-error";
import {
  DELEGATION_MODE,
  type DelegationMode,
  planDelegationRequest,
} from "../domain/delegation-policy";
import type { DelegationActor, DelegationJob } from "./delegation-types";

export type DelegationAction = "cancel" | "prepare" | "retry";

export interface DelegationCommandPort {
  create(input: {
    actor: DelegationActor;
    request: string;
    mode: DelegationMode;
    plan: ReturnType<typeof planDelegationRequest>;
  }): Promise<DelegationJob>;
  list(actor: DelegationActor): Promise<DelegationJob[]>;
  find(actor: DelegationActor, jobId: string): Promise<DelegationJob | null>;
  act(
    actor: DelegationActor,
    jobId: string,
    action: DelegationAction,
    preparePlan?: ReturnType<typeof planDelegationRequest>,
  ): Promise<DelegationJob>;
}

export const createDelegationCommands = (port: DelegationCommandPort) => ({
  create(
    actor: DelegationActor,
    rawRequest: string,
    mode: DelegationMode = DELEGATION_MODE.SAFE_AUTO,
  ) {
    const request = rawRequest.trim();
    const plan = planDelegationRequest(request, mode);
    if (plan.decision.outcome === "BLOCK") {
      throw new ApplicationError("DELEGATION_SENSITIVE_INPUT", plan.decision.reason, "bad_request");
    }
    return port.create({ actor, request, mode, plan });
  },
  list: (actor: DelegationActor) => port.list(actor),
  async act(actor: DelegationActor, jobId: string, action: DelegationAction) {
    const job = action === "prepare" ? await port.find(actor, jobId) : null;
    const preparePlan = job
      ? planDelegationRequest(job.request, DELEGATION_MODE.PREPARE)
      : undefined;
    return port.act(actor, jobId, action, preparePlan);
  },
});
