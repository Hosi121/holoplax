export type AccountUpdate = { name?: string; email?: string; image?: string };

export interface IdentityPort {
  getAccount(userId: string): Promise<{ user: unknown; linkedProviders: string[] }>;
  updateAccount(userId: string, input: AccountUpdate): Promise<{ user: unknown }>;
  changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void>;
  unlinkProvider(userId: string, provider: string): Promise<void>;
  register(input: {
    email: string;
    password: string;
    name?: string;
    callbackUrl?: string;
  }): Promise<{
    id: string;
    email: string | null;
    requiresEmailVerification: boolean;
    verificationEmailSent: boolean;
  }>;
  requestPasswordReset(email: string): Promise<void>;
  resendVerification(email: string, callbackUrl?: string): Promise<void>;
  resetPassword(token: string, password: string): Promise<void>;
  verifyEmail(token: string): Promise<void>;
}

export const createIdentityCommands = (port: IdentityPort) => ({
  getAccount: (userId: string) => port.getAccount(userId),
  updateAccount: (userId: string, input: AccountUpdate) => port.updateAccount(userId, input),
  changePassword: (userId: string, currentPassword: string, newPassword: string) =>
    port.changePassword(userId, currentPassword, newPassword),
  unlinkProvider: (userId: string, provider: string) => port.unlinkProvider(userId, provider),
  register: (input: Parameters<IdentityPort["register"]>[0]) => port.register(input),
  requestPasswordReset: (email: string) => port.requestPasswordReset(email),
  resendVerification: (email: string, callbackUrl?: string) =>
    port.resendVerification(email, callbackUrl),
  resetPassword: (token: string, password: string) => port.resetPassword(token, password),
  verifyEmail: (token: string) => port.verifyEmail(token),
});
