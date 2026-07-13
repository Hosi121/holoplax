import { createAdminOperations } from "./application/admin-operations";
import { prismaAdminOperationsPort } from "./infrastructure/prisma-admin-operations";

const operations = createAdminOperations(prismaAdminOperationsPort);
export const getAdminAiSetting = operations.getAiSetting;
export const updateAdminAiSetting = operations.updateAiSetting;
export const getAdminAudit = operations.getAudit;
export const runAdminMaintenance = operations.runMaintenance;
export const listAdminUsers = operations.listUsers;
export const createAdminUser = operations.createUser;
export const updateAdminUser = operations.updateUser;
export const listAdminUserTasks = operations.listUserTasks;
