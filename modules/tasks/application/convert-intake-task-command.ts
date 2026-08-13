export type ConvertIntakeTaskCommand = {
  intakeId: string;
  workspaceId: string;
  taskType?: "EPIC" | "PBI" | "TASK" | null;
};
