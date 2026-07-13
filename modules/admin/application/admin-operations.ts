export type AuditRange = { start: Date; end: Date; label: string; mode: string };
export type AdminAuditResult =
  | { kind: "csv"; csv: string; fileLabel: string }
  | { kind: "json"; logs: unknown[]; stats: unknown };

export interface AdminOperationsPort {
  getAiSetting(): Promise<unknown>;
  updateAiSetting(
    actorId: string,
    input: { model?: string; baseUrl?: string; enabled?: boolean; apiKey?: string },
  ): Promise<unknown>;
  getAudit(input: {
    filter: string | null;
    format: string | null;
    range: AuditRange;
    limit: number;
  }): Promise<AdminAuditResult>;
  runMaintenance(actorId: string): Promise<Record<string, number>>;
  listUsers(input: { cursor?: string; limit: number }): Promise<{
    users: unknown[];
    nextCursor: string | null;
  }>;
  createUser(
    actorId: string,
    input: { email: string; password: string; name?: string; role?: string },
  ): Promise<unknown>;
  updateUser(
    actorId: string,
    targetUserId: string,
    input: { role?: string; disabled?: boolean },
  ): Promise<unknown>;
  listUserTasks(userId: string): Promise<unknown[]>;
}

export const createAdminOperations = (port: AdminOperationsPort) => ({
  getAiSetting: () => port.getAiSetting(),
  updateAiSetting: (
    actorId: string,
    input: Parameters<AdminOperationsPort["updateAiSetting"]>[1],
  ) => port.updateAiSetting(actorId, input),
  getAudit: (input: Parameters<AdminOperationsPort["getAudit"]>[0]) => port.getAudit(input),
  runMaintenance: (actorId: string) => port.runMaintenance(actorId),
  listUsers: (input: Parameters<AdminOperationsPort["listUsers"]>[0]) => port.listUsers(input),
  createUser: (actorId: string, input: Parameters<AdminOperationsPort["createUser"]>[1]) =>
    port.createUser(actorId, input),
  updateUser: (
    actorId: string,
    targetUserId: string,
    input: Parameters<AdminOperationsPort["updateUser"]>[2],
  ) => port.updateUser(actorId, targetUserId, input),
  listUserTasks: (userId: string) => port.listUserTasks(userId),
});
