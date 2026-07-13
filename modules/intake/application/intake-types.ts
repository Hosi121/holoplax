export type IntakeActor = {
  userId: string;
  workspaceId: string | null;
};

export type IntakeItemRecord = {
  id: string;
  origin: "MEMO" | "SLACK" | "DISCORD" | "EMAIL" | "CALENDAR";
  status: "PENDING" | "CONVERTED" | "DISMISSED";
  title: string;
  body: string;
  payload: unknown;
  userId: string;
  workspaceId: string | null;
  taskId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type IntakeDuplicate = {
  id: string;
  title: string;
  status: "BACKLOG" | "SPRINT" | "DONE";
  score: number;
};

export type ResolveIntakeInput = {
  intakeId: string;
  action: "dismiss" | "merge" | "create";
  workspaceId?: string | null;
  taskType?: "EPIC" | "PBI" | "TASK" | null;
  targetTaskId?: string | null;
};

export type IntakeCommandPort = {
  list(actor: IntakeActor): Promise<{
    currentWorkspaceId: string | null;
    globalItems: IntakeItemRecord[];
    workspaceItems: IntakeItemRecord[];
  }>;
  createMemo(
    actor: IntakeActor,
    text: string,
  ): Promise<{ item: IntakeItemRecord; duplicates: IntakeDuplicate[] }>;
  analyze(
    actor: IntakeActor,
    input: { intakeId: string; workspaceId: string },
  ): Promise<{ duplicates: IntakeDuplicate[] }>;
  resolve(
    actor: Pick<IntakeActor, "userId">,
    input: ResolveIntakeInput,
  ): Promise<{ status: "DISMISSED" } | { taskId: string }>;
  captureDiscord(input: {
    userId: string;
    title: string;
    body: string;
    author: string;
    channel: string;
    payload: Record<string, unknown>;
  }): Promise<{ itemId: string }>;
};
