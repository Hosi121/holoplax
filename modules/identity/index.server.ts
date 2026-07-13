import { createIdentityCommands } from "./application/identity-commands";
import { prismaIdentityPort } from "./infrastructure/prisma-identity";

const commands = createIdentityCommands(prismaIdentityPort);
export const getAccount = commands.getAccount;
export const updateAccount = commands.updateAccount;
export const changeAccountPassword = commands.changePassword;
export const unlinkAccountProvider = commands.unlinkProvider;
export const registerAccount = commands.register;
export const requestPasswordReset = commands.requestPasswordReset;
export const resendEmailVerification = commands.resendVerification;
export const resetPassword = commands.resetPassword;
export const verifyEmail = commands.verifyEmail;
