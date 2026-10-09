import { convertIntakeItemToTask } from "../tasks/index.server";
import { createIntakeCommands } from "./application/intake-commands";
import { d1IntakeCommandPort } from "./infrastructure/d1-intake-command-port";

const commands = createIntakeCommands(d1IntakeCommandPort, convertIntakeItemToTask);

export const listIntakeItems = commands.list;
export const createIntakeMemo = commands.createMemo;
export const analyzeIntakeItem = commands.analyze;
export const resolveIntakeItem = commands.resolve;

export type { ResolveIntakeInput } from "./application/intake-types";
