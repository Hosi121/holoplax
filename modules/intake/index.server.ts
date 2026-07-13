import { convertIntakeItemToTask } from "../tasks/index.server";
import { createIntakeCommands } from "./application/intake-commands";
import { prismaIntakeCommandPort } from "./infrastructure/prisma-intake-command-port";

const commands = createIntakeCommands(prismaIntakeCommandPort, convertIntakeItemToTask);

export const listIntakeItems = commands.list;
export const createIntakeMemo = commands.createMemo;
export const analyzeIntakeItem = commands.analyze;
export const resolveIntakeItem = commands.resolve;
export const captureDiscordIntake = commands.captureDiscord;

export type { ResolveIntakeInput } from "./application/intake-types";
