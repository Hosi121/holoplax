export type ConvertIntakeTaskCommand = {
  intakeId: string;
  workspaceId: string;
  taskType?: "EPIC" | "PBI" | "TASK" | null;
};

export interface ConvertIntakeTaskCommandPort {
  execute(
    actor: { userId: string },
    command: ConvertIntakeTaskCommand,
  ): Promise<{ taskId: string }>;
}

export const createConvertIntakeTaskCommand = (port: ConvertIntakeTaskCommandPort) =>
  port.execute.bind(port);
