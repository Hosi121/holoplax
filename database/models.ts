import type { DatabaseClient, Include, Where } from "./client";
import { DatabaseError as ClientDatabaseError } from "./client";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type TaskStatus = "BACKLOG" | "SPRINT" | "DONE";

export type TaskWorkflowState = "READY" | "IN_PROGRESS" | "BLOCKED" | "DONE" | "CANCELED";

export type TaskType = "EPIC" | "PBI" | "TASK";

export type AiSuggestionType = "TIP" | "SCORE" | "SPLIT";

export type SuggestionReaction = "VIEWED" | "ACCEPTED" | "MODIFIED" | "REJECTED" | "IGNORED";

export type AiPrepType = "EMAIL" | "IMPLEMENTATION" | "CHECKLIST";

export type AiPrepStatus = "PENDING" | "APPROVED" | "APPLIED" | "REJECTED";

export type AiProvider = "OPENAI" | "OPENAI_COMPATIBLE" | "ANTHROPIC" | "GEMINI";

export type Severity = "LOW" | "MEDIUM" | "HIGH";

export type UserRole = "ADMIN" | "USER";

export type WorkspaceRole = "owner" | "admin" | "member";

export type SprintStatus = "ACTIVE" | "CLOSED";

export type SprintItemOutcome = "COMMITTED" | "COMPLETED" | "REMOVED" | "CARRYOVER";

export type SprintItemEventType =
  | "COMMITTED"
  | "RECOMMITTED"
  | "COMPLETED"
  | "REOPENED"
  | "REMOVED"
  | "CARRYOVER";

export type TaskDependencyState = "REQUIRED" | "WAIVED";

export type TaskDependencyEventType = "REQUIRED" | "WAIVED";

export type TaskAutomationJobStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELED";

export type DelegationMode = "PREPARE" | "SAFE_AUTO";

export type DelegationKind = "RESEARCH" | "WRITING" | "CODE" | "GENERAL";

export type DelegationRisk = "LOW" | "REVIEW" | "RESTRICTED";

export type DelegationJobStatus =
  | "PENDING"
  | "RUNNING"
  | "NEEDS_APPROVAL"
  | "NEEDS_INPUT"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELED";

export type RoutineCadence = "DAILY" | "WEEKLY";

export type IntakeSource = "MEMO" | "SLACK" | "DISCORD" | "EMAIL" | "CALENDAR";

export type IntakeStatus = "PENDING" | "CONVERTED" | "DISMISSED";

export type MemoryScope = "USER" | "WORKSPACE";

export type MemoryValueType =
  | "STRING"
  | "NUMBER"
  | "BOOL"
  | "JSON"
  | "RATIO"
  | "DURATION_MS"
  | "HISTOGRAM_24x7"
  | "RATIO_BY_TYPE";

export type MemorySource = "EXPLICIT" | "INFERRED";

export type MemoryStatus = "ACTIVE" | "REJECTED" | "STALE";

export type MemoryQuestionStatus = "PENDING" | "ACCEPTED" | "REJECTED" | "HOLD";

export type TaskAutomationStatus = "NONE" | "PREPARED" | "SPLIT_PENDING" | "SPLIT_REJECTED";

export type TaskHierarchyRole = "STANDARD" | "SPLIT_PARENT" | "SPLIT_CHILD";

export type TaskOrigin = "MANUAL" | "INTAKE" | "AUTOMATION" | "ROUTINE" | "ONBOARDING";

export type TaskStatusEventSource = "API" | "BULK" | "ROUTINE" | "SPRINT_END";

export type User = {
  id: string;
  name: string | null;
  email: string | null;
  emailVerified: Date | null;
  image: string | null;
  role: UserRole;
  disabledAt: Date | null;
  onboardingCompletedAt: Date | null;
  passwordChangedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type Account = {
  id: string;
  userId: string;
  type: string;
  provider: string;
  providerAccountId: string;
  refresh_token: string | null;
  access_token: string | null;
  expires_at: number | null;
  token_type: string | null;
  scope: string | null;
  id_token: string | null;
  session_state: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type Session = {
  id: string;
  sessionToken: string;
  userId: string;
  expires: Date;
  createdAt: Date;
  updatedAt: Date;
};

export type UserPassword = {
  id: string;
  userId: string;
  hash: string;
  createdAt: Date;
  updatedAt: Date;
};

export type EmailVerificationToken = {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  createdAt: Date;
};

export type PasswordResetToken = {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
  used: boolean;
  createdAt: Date;
};

export type VerificationToken = {
  identifier: string;
  token: string;
  expires: Date;
};

export type Workspace = {
  id: string;
  name: string;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
};

export type WorkspaceMember = {
  id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  createdAt: Date;
};

export type WorkspaceInvite = {
  id: string;
  workspaceId: string;
  email: string;
  role: WorkspaceRole;
  token: string;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
};

export type AuditLog = {
  id: string;
  actorId: string | null;
  action: string;
  targetUserId: string | null;
  targetWorkspaceId: string | null;
  metadata: JsonValue | null;
  createdAt: Date;
};

export type Task = {
  id: string;
  title: string;
  description: string;
  definitionOfDone: string;
  checklist: JsonValue | null;
  points: number;
  urgency: Severity;
  risk: Severity;
  workflowState: TaskWorkflowState;
  type: TaskType;
  automationStatus: TaskAutomationStatus;
  hierarchyRole: TaskHierarchyRole;
  origin: TaskOrigin;
  parentId: string | null;
  sprintId: string | null;
  routineSeriesId: string | null;
  dueDate: Date | null;
  assigneeId: string | null;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  userId: string | null;
  workspaceId: string;
};

export type VelocityEntry = {
  id: string;
  name: string;
  points: number;
  range: string;
  createdAt: Date;
  userId: string | null;
  workspaceId: string | null;
  sprintId: string | null;
};

export type AiProviderSetting = {
  id: number;
  model: string;
  apiKey: string;
  baseUrl: string | null;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type AiPricing = {
  id: string;
  provider: AiProvider;
  model: string;
  inputUsdPerM: number;
  outputUsdPerM: number;
  createdAt: Date;
  updatedAt: Date;
};

export type UserAutomationSetting = {
  id: string;
  low: number;
  high: number;
  stage: number;
  lastStageAt: Date | null;
  updatedAt: Date;
  createdAt: Date;
  userId: string;
  workspaceId: string;
};

export type AutomationStageHistory = {
  id: string;
  userId: string;
  workspaceId: string | null;
  stage: number;
  reason: string | null;
  createdAt: Date;
};

export type RoutineRule = {
  id: string;
  taskId: string;
  seriesId: string;
  cadence: RoutineCadence;
  nextAt: Date;
  timezone: string;
  createdAt: Date;
  updatedAt: Date;
};

export type RoutineSeries = {
  id: string;
  cadence: RoutineCadence;
  nextAt: Date;
  timezone: string;
  active: boolean;
  workspaceId: string;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type AiSuggestion = {
  id: string;
  type: AiSuggestionType;
  taskId: string | null;
  inputTitle: string;
  inputDescription: string;
  output: string;
  createdAt: Date;
  userId: string | null;
  workspaceId: string | null;
};

export type AiSuggestionReaction = {
  id: string;
  suggestionId: string;
  reaction: SuggestionReaction;
  taskType: TaskType | null;
  taskPoints: number | null;
  hourOfDay: number | null;
  dayOfWeek: number | null;
  wipCount: number | null;
  flowState: number | null;
  modification: JsonValue | null;
  viewedAt: Date | null;
  reactedAt: Date | null;
  latencyMs: number | null;
  userId: string;
  workspaceId: string | null;
  createdAt: Date;
};

export type AiPrepOutput = {
  id: string;
  type: AiPrepType;
  status: AiPrepStatus;
  taskId: string;
  output: string;
  createdAt: Date;
  updatedAt: Date;
  userId: string | null;
  workspaceId: string | null;
};

export type AiUsage = {
  id: string;
  action: string;
  provider: string;
  model: string;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  costUsd: number | null;
  usageSource: string;
  feature: string | null;
  taskId: string | null;
  userId: string | null;
  workspaceId: string | null;
  createdAt: Date;
};

export type Sprint = {
  id: string;
  name: string;
  status: SprintStatus;
  capacityPoints: number;
  startedAt: Date;
  plannedEndAt: Date | null;
  endedAt: Date | null;
  userId: string | null;
  workspaceId: string;
  createdAt: Date;
  updatedAt: Date;
};

export type TaskDependency = {
  taskId: string;
  dependsOnId: string;
  workspaceId: string;
  state: TaskDependencyState;
  waivedAt: Date | null;
};

export type TaskDependencyEvent = {
  id: string;
  taskId: string | null;
  taskKey: string;
  dependsOnId: string | null;
  dependsOnKey: string;
  type: TaskDependencyEventType;
  actorId: string | null;
  workspaceId: string | null;
  reason: string | null;
  createdAt: Date;
};

export type TaskStatusEvent = {
  id: string;
  taskId: string | null;
  taskKey: string;
  taskTitle: string;
  fromStatus: TaskStatus | null;
  toStatus: TaskStatus;
  actorId: string | null;
  trigger: TaskStatusEventSource | null;
  workspaceId: string | null;
  createdAt: Date;
};

export type TaskWorkflowEvent = {
  id: string;
  taskId: string | null;
  taskKey: string;
  taskCreatedAt: Date | null;
  taskDueDate: Date | null;
  taskPoints: number | null;
  taskCreatorId: string | null;
  fromState: TaskWorkflowState | null;
  toState: TaskWorkflowState;
  actorId: string | null;
  trigger: TaskStatusEventSource | null;
  workspaceId: string | null;
  createdAt: Date;
};

export type SprintItem = {
  id: string;
  sprintId: string;
  taskId: string | null;
  taskKey: string;
  taskTitle: string;
  taskType: TaskType;
  committedPoints: number;
  outcome: SprintItemOutcome;
  committedAt: Date;
  completedAt: Date | null;
  removedAt: Date | null;
  carriedFromId: string | null;
};

export type SprintItemEvent = {
  id: string;
  sprintItemId: string;
  type: SprintItemEventType;
  taskTitle: string;
  taskType: TaskType;
  committedPoints: number;
  occurredAt: Date;
};

export type TaskAutomationJob = {
  id: string;
  dedupeKey: string;
  taskId: string | null;
  taskKey: string;
  workspaceId: string;
  requestedById: string | null;
  status: TaskAutomationJobStatus;
  attempts: number;
  availableAt: Date;
  lockedAt: Date | null;
  lockedBy: string | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type DelegationJob = {
  id: string;
  userId: string;
  workspaceId: string | null;
  request: string;
  mode: DelegationMode;
  kind: DelegationKind;
  risk: DelegationRisk;
  status: DelegationJobStatus;
  approvalReason: string | null;
  plan: JsonValue;
  result: string | null;
  verification: JsonValue | null;
  attempts: number;
  availableAt: Date;
  lockedAt: Date | null;
  lockedBy: string | null;
  lastError: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type MemoryDefinition = {
  id: string;
  key: string;
  scope: MemoryScope;
  valueType: MemoryValueType;
  unit: string | null;
  granularity: string;
  updatePolicy: string;
  decayDays: number | null;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type MemoryClaim = {
  id: string;
  definitionId: string;
  userId: string | null;
  workspaceId: string | null;
  valueStr: string | null;
  valueNum: number | null;
  valueBool: boolean | null;
  valueJson: JsonValue | null;
  confidence: number;
  provenance: MemorySource;
  status: MemoryStatus;
  validFrom: Date;
  validTo: Date | null;
  evidence: JsonValue | null;
  createdAt: Date;
  updatedAt: Date;
};

export type MemoryQuestion = {
  id: string;
  definitionId: string;
  userId: string | null;
  workspaceId: string | null;
  valueStr: string | null;
  valueNum: number | null;
  valueBool: boolean | null;
  valueJson: JsonValue | null;
  confidence: number;
  status: MemoryQuestionStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type MemoryMetric = {
  id: string;
  definitionId: string;
  userId: string | null;
  workspaceId: string | null;
  windowStart: Date;
  windowEnd: Date;
  valueNum: number | null;
  valueJson: JsonValue | null;
  computedAt: Date;
};

export type IntakeItem = {
  id: string;
  origin: IntakeSource;
  status: IntakeStatus;
  title: string;
  body: string;
  payload: JsonValue | null;
  userId: string;
  workspaceId: string | null;
  taskId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type TaskComment = {
  id: string;
  taskId: string;
  authorId: string;
  workspaceId: string;
  content: string;
  editedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type McpApiKey = {
  id: string;
  name: string;
  keyHash: string;
  keyPrefix: string;
  userId: string;
  workspaceId: string;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
};

export interface Models {
  User: User;
  Account: Account;
  Session: Session;
  UserPassword: UserPassword;
  EmailVerificationToken: EmailVerificationToken;
  PasswordResetToken: PasswordResetToken;
  VerificationToken: VerificationToken;
  Workspace: Workspace;
  WorkspaceMember: WorkspaceMember;
  WorkspaceInvite: WorkspaceInvite;
  AuditLog: AuditLog;
  Task: Task;
  VelocityEntry: VelocityEntry;
  AiProviderSetting: AiProviderSetting;
  AiPricing: AiPricing;
  UserAutomationSetting: UserAutomationSetting;
  AutomationStageHistory: AutomationStageHistory;
  RoutineRule: RoutineRule;
  RoutineSeries: RoutineSeries;
  AiSuggestion: AiSuggestion;
  AiSuggestionReaction: AiSuggestionReaction;
  AiPrepOutput: AiPrepOutput;
  AiUsage: AiUsage;
  Sprint: Sprint;
  TaskDependency: TaskDependency;
  TaskDependencyEvent: TaskDependencyEvent;
  TaskStatusEvent: TaskStatusEvent;
  TaskWorkflowEvent: TaskWorkflowEvent;
  SprintItem: SprintItem;
  SprintItemEvent: SprintItemEvent;
  TaskAutomationJob: TaskAutomationJob;
  DelegationJob: DelegationJob;
  MemoryDefinition: MemoryDefinition;
  MemoryClaim: MemoryClaim;
  MemoryQuestion: MemoryQuestion;
  MemoryMetric: MemoryMetric;
  IntakeItem: IntakeItem;
  TaskComment: TaskComment;
  McpApiKey: McpApiKey;
}

export interface Relations {
  User: {
    accounts: { table: "Account"; many: true; nullable: false };
    sessions: { table: "Session"; many: true; nullable: false };
    memberships: { table: "WorkspaceMember"; many: true; nullable: false };
    workspacesOwned: { table: "Workspace"; many: true; nullable: false };
    password: { table: "UserPassword"; many: false; nullable: true };
    emailTokens: { table: "EmailVerificationToken"; many: true; nullable: false };
    resetTokens: { table: "PasswordResetToken"; many: true; nullable: false };
    auditLogsAsActor: { table: "AuditLog"; many: true; nullable: false };
    auditLogsAsTarget: { table: "AuditLog"; many: true; nullable: false };
    tasks: { table: "Task"; many: true; nullable: false };
    assignedTasks: { table: "Task"; many: true; nullable: false };
    velocityEntries: { table: "VelocityEntry"; many: true; nullable: false };
    userAutomationSettings: { table: "UserAutomationSetting"; many: true; nullable: false };
    aiSuggestions: { table: "AiSuggestion"; many: true; nullable: false };
    aiPrepOutputs: { table: "AiPrepOutput"; many: true; nullable: false };
    aiUsages: { table: "AiUsage"; many: true; nullable: false };
    sprints: { table: "Sprint"; many: true; nullable: false };
    intakeItems: { table: "IntakeItem"; many: true; nullable: false };
    taskStatusEvents: { table: "TaskStatusEvent"; many: true; nullable: false };
    taskWorkflowEvents: { table: "TaskWorkflowEvent"; many: true; nullable: false };
    taskDependencyEvents: { table: "TaskDependencyEvent"; many: true; nullable: false };
    taskAutomationJobs: { table: "TaskAutomationJob"; many: true; nullable: false };
    delegationJobs: { table: "DelegationJob"; many: true; nullable: false };
    memoryClaims: { table: "MemoryClaim"; many: true; nullable: false };
    memoryMetrics: { table: "MemoryMetric"; many: true; nullable: false };
    memoryQuestions: { table: "MemoryQuestion"; many: true; nullable: false };
    automationStageHistories: { table: "AutomationStageHistory"; many: true; nullable: false };
    aiSuggestionReactions: { table: "AiSuggestionReaction"; many: true; nullable: false };
    taskComments: { table: "TaskComment"; many: true; nullable: false };
    routineSeriesCreated: { table: "RoutineSeries"; many: true; nullable: false };
    mcpApiKeys: { table: "McpApiKey"; many: true; nullable: false };
  };
  Account: { user: { table: "User"; many: false; nullable: false } };
  Session: { user: { table: "User"; many: false; nullable: false } };
  UserPassword: { user: { table: "User"; many: false; nullable: false } };
  EmailVerificationToken: { user: { table: "User"; many: false; nullable: false } };
  PasswordResetToken: { user: { table: "User"; many: false; nullable: false } };
  VerificationToken: Record<never, never>;
  Workspace: {
    owner: { table: "User"; many: false; nullable: false };
    members: { table: "WorkspaceMember"; many: true; nullable: false };
    tasks: { table: "Task"; many: true; nullable: false };
    velocityEntries: { table: "VelocityEntry"; many: true; nullable: false };
    userAutomationSettings: { table: "UserAutomationSetting"; many: true; nullable: false };
    aiSuggestions: { table: "AiSuggestion"; many: true; nullable: false };
    aiPrepOutputs: { table: "AiPrepOutput"; many: true; nullable: false };
    aiUsages: { table: "AiUsage"; many: true; nullable: false };
    invites: { table: "WorkspaceInvite"; many: true; nullable: false };
    auditLogs: { table: "AuditLog"; many: true; nullable: false };
    sprints: { table: "Sprint"; many: true; nullable: false };
    intakeItems: { table: "IntakeItem"; many: true; nullable: false };
    statusEvents: { table: "TaskStatusEvent"; many: true; nullable: false };
    workflowEvents: { table: "TaskWorkflowEvent"; many: true; nullable: false };
    dependencyEvents: { table: "TaskDependencyEvent"; many: true; nullable: false };
    memoryClaims: { table: "MemoryClaim"; many: true; nullable: false };
    memoryMetrics: { table: "MemoryMetric"; many: true; nullable: false };
    memoryQuestions: { table: "MemoryQuestion"; many: true; nullable: false };
    automationStageHistories: { table: "AutomationStageHistory"; many: true; nullable: false };
    aiSuggestionReactions: { table: "AiSuggestionReaction"; many: true; nullable: false };
    taskComments: { table: "TaskComment"; many: true; nullable: false };
    routineSeries: { table: "RoutineSeries"; many: true; nullable: false };
    taskAutomationJobs: { table: "TaskAutomationJob"; many: true; nullable: false };
    delegationJobs: { table: "DelegationJob"; many: true; nullable: false };
    mcpApiKeys: { table: "McpApiKey"; many: true; nullable: false };
  };
  WorkspaceMember: {
    workspace: { table: "Workspace"; many: false; nullable: false };
    user: { table: "User"; many: false; nullable: false };
  };
  WorkspaceInvite: { workspace: { table: "Workspace"; many: false; nullable: false } };
  AuditLog: {
    actor: { table: "User"; many: false; nullable: true };
    targetUser: { table: "User"; many: false; nullable: true };
    targetWorkspace: { table: "Workspace"; many: false; nullable: true };
  };
  Task: {
    suggestions: { table: "AiSuggestion"; many: true; nullable: false };
    prepOutputs: { table: "AiPrepOutput"; many: true; nullable: false };
    sprint: { table: "Sprint"; many: false; nullable: true };
    assignee: { table: "User"; many: false; nullable: true };
    user: { table: "User"; many: false; nullable: true };
    workspace: { table: "Workspace"; many: false; nullable: false };
    parent: { table: "Task"; many: false; nullable: true };
    children: { table: "Task"; many: true; nullable: false };
    dependencies: { table: "TaskDependency"; many: true; nullable: false };
    dependents: { table: "TaskDependency"; many: true; nullable: false };
    dependencyEventsAsTask: { table: "TaskDependencyEvent"; many: true; nullable: false };
    dependencyEventsAsPrerequisite: { table: "TaskDependencyEvent"; many: true; nullable: false };
    intakeItems: { table: "IntakeItem"; many: true; nullable: false };
    statusEvents: { table: "TaskStatusEvent"; many: true; nullable: false };
    workflowEvents: { table: "TaskWorkflowEvent"; many: true; nullable: false };
    sprintItems: { table: "SprintItem"; many: true; nullable: false };
    automationJobs: { table: "TaskAutomationJob"; many: true; nullable: false };
    routineRule: { table: "RoutineRule"; many: false; nullable: true };
    routineSeries: { table: "RoutineSeries"; many: false; nullable: true };
    comments: { table: "TaskComment"; many: true; nullable: false };
  };
  VelocityEntry: {
    user: { table: "User"; many: false; nullable: true };
    workspace: { table: "Workspace"; many: false; nullable: true };
    sprint: { table: "Sprint"; many: false; nullable: true };
  };
  AiProviderSetting: Record<never, never>;
  AiPricing: Record<never, never>;
  UserAutomationSetting: {
    user: { table: "User"; many: false; nullable: false };
    workspace: { table: "Workspace"; many: false; nullable: false };
  };
  AutomationStageHistory: {
    user: { table: "User"; many: false; nullable: false };
    workspace: { table: "Workspace"; many: false; nullable: true };
  };
  RoutineRule: {
    task: { table: "Task"; many: false; nullable: false };
    series: { table: "RoutineSeries"; many: false; nullable: false };
  };
  RoutineSeries: {
    workspace: { table: "Workspace"; many: false; nullable: false };
    createdBy: { table: "User"; many: false; nullable: true };
    tasks: { table: "Task"; many: true; nullable: false };
    rule: { table: "RoutineRule"; many: false; nullable: true };
  };
  AiSuggestion: {
    task: { table: "Task"; many: false; nullable: true };
    user: { table: "User"; many: false; nullable: true };
    workspace: { table: "Workspace"; many: false; nullable: true };
    reactions: { table: "AiSuggestionReaction"; many: true; nullable: false };
  };
  AiSuggestionReaction: {
    suggestion: { table: "AiSuggestion"; many: false; nullable: false };
    user: { table: "User"; many: false; nullable: false };
    workspace: { table: "Workspace"; many: false; nullable: true };
  };
  AiPrepOutput: {
    task: { table: "Task"; many: false; nullable: false };
    user: { table: "User"; many: false; nullable: true };
    workspace: { table: "Workspace"; many: false; nullable: true };
  };
  AiUsage: {
    user: { table: "User"; many: false; nullable: true };
    workspace: { table: "Workspace"; many: false; nullable: true };
  };
  Sprint: {
    user: { table: "User"; many: false; nullable: true };
    workspace: { table: "Workspace"; many: false; nullable: false };
    tasks: { table: "Task"; many: true; nullable: false };
    items: { table: "SprintItem"; many: true; nullable: false };
    velocityEntry: { table: "VelocityEntry"; many: false; nullable: true };
  };
  TaskDependency: {
    task: { table: "Task"; many: false; nullable: false };
    dependsOn: { table: "Task"; many: false; nullable: false };
  };
  TaskDependencyEvent: {
    task: { table: "Task"; many: false; nullable: true };
    dependsOn: { table: "Task"; many: false; nullable: true };
    actor: { table: "User"; many: false; nullable: true };
    workspace: { table: "Workspace"; many: false; nullable: true };
  };
  TaskStatusEvent: {
    task: { table: "Task"; many: false; nullable: true };
    actor: { table: "User"; many: false; nullable: true };
    workspace: { table: "Workspace"; many: false; nullable: true };
  };
  TaskWorkflowEvent: {
    task: { table: "Task"; many: false; nullable: true };
    actor: { table: "User"; many: false; nullable: true };
    workspace: { table: "Workspace"; many: false; nullable: true };
  };
  SprintItem: {
    sprint: { table: "Sprint"; many: false; nullable: false };
    task: { table: "Task"; many: false; nullable: true };
    carriedFrom: { table: "SprintItem"; many: false; nullable: true };
    carriedItems: { table: "SprintItem"; many: true; nullable: false };
    events: { table: "SprintItemEvent"; many: true; nullable: false };
  };
  SprintItemEvent: { sprintItem: { table: "SprintItem"; many: false; nullable: false } };
  TaskAutomationJob: {
    task: { table: "Task"; many: false; nullable: true };
    workspace: { table: "Workspace"; many: false; nullable: false };
    requestedBy: { table: "User"; many: false; nullable: true };
  };
  DelegationJob: {
    user: { table: "User"; many: false; nullable: false };
    workspace: { table: "Workspace"; many: false; nullable: true };
  };
  MemoryDefinition: {
    claims: { table: "MemoryClaim"; many: true; nullable: false };
    metrics: { table: "MemoryMetric"; many: true; nullable: false };
    questions: { table: "MemoryQuestion"; many: true; nullable: false };
  };
  MemoryClaim: {
    definition: { table: "MemoryDefinition"; many: false; nullable: false };
    user: { table: "User"; many: false; nullable: true };
    workspace: { table: "Workspace"; many: false; nullable: true };
  };
  MemoryQuestion: {
    definition: { table: "MemoryDefinition"; many: false; nullable: false };
    user: { table: "User"; many: false; nullable: true };
    workspace: { table: "Workspace"; many: false; nullable: true };
  };
  MemoryMetric: {
    definition: { table: "MemoryDefinition"; many: false; nullable: false };
    user: { table: "User"; many: false; nullable: true };
    workspace: { table: "Workspace"; many: false; nullable: true };
  };
  IntakeItem: {
    user: { table: "User"; many: false; nullable: false };
    workspace: { table: "Workspace"; many: false; nullable: true };
    task: { table: "Task"; many: false; nullable: true };
  };
  TaskComment: {
    task: { table: "Task"; many: false; nullable: false };
    author: { table: "User"; many: false; nullable: false };
    workspace: { table: "Workspace"; many: false; nullable: false };
  };
  McpApiKey: {
    user: { table: "User"; many: false; nullable: false };
    workspace: { table: "Workspace"; many: false; nullable: false };
  };
}

export namespace Db {
  export const DatabaseError = ClientDatabaseError;
  export type TransactionClient = DatabaseClient;
  export type JsonValue = import("./models").JsonValue;
  export type JsonObject = { [key: string]: JsonValue };
  export type InputJsonValue = JsonValue;
  export type NullableJsonNullValueInput = null;
  export type TaskWhereInput = Where<"Task">;
  export type TaskInclude = Include<"Task">;
  export const DbNull = null;
  export const JsonNull = null;
}
