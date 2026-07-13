import type {
  DelegationKind,
  DelegationMode,
  DelegationPlan,
  DelegationRisk,
} from "../domain/delegation-policy";

export type DelegationJobStatus =
  | "PENDING"
  | "RUNNING"
  | "NEEDS_APPROVAL"
  | "NEEDS_INPUT"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELED";

export type DelegationVerification = {
  passed: boolean;
  summary: string;
  issues: string[];
  method: "ai" | "basic";
};

export type DelegationJob = {
  id: string;
  request: string;
  mode: DelegationMode;
  kind: DelegationKind;
  risk: DelegationRisk;
  status: DelegationJobStatus;
  approvalReason: string | null;
  plan: DelegationPlan;
  result: string | null;
  verification: DelegationVerification | null;
  lastError: string | null;
  attempts: number;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
};

export type DelegationActor = {
  userId: string;
  workspaceId: string | null;
};
