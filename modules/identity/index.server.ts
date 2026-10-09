import { createIdentityCommands } from "./application/identity-commands";
import { d1IdentityPort } from "./infrastructure/d1-identity";

const commands = createIdentityCommands(d1IdentityPort);
export const getAccount = commands.getAccount;
export const updateAccount = commands.updateAccount;
export const changeAccountPassword = commands.changePassword;
export const unlinkAccountProvider = commands.unlinkProvider;
export const registerAccount = commands.register;
export const requestPasswordReset = commands.requestPasswordReset;
export const resendEmailVerification = commands.resendVerification;
export const resetPassword = commands.resetPassword;
export const verifyEmail = commands.verifyEmail;
