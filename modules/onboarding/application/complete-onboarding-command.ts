type StoryPoint = 1 | 2 | 3 | 5 | 8 | 13 | 21 | 34;

export type CompleteOnboardingCommand = {
  workspaceName: string;
  goalTitle?: string;
  goalDescription?: string;
  intent?: string;
  points?: StoryPoint;
  routineTitle?: string;
  routineDescription?: string;
  routineCadence?: string;
  focusTasks?: string[];
};

export type CompleteOnboardingResult =
  | { created: false; completedAt: Date }
  | {
      created: true;
      completedAt: Date;
      workspaceId: string;
    };

export interface CompleteOnboardingCommandPort {
  execute(userId: string, command: CompleteOnboardingCommand): Promise<CompleteOnboardingResult>;
}

type OnboardingTaskCreator = (
  actor: {
    userId: string;
    workspaceId: string;
    origin?: "ONBOARDING";
  },
  input: {
    title: string;
    description?: string;
    points: StoryPoint;
    urgency: "LOW" | "MEDIUM" | "HIGH";
    risk: "LOW" | "MEDIUM" | "HIGH";
    status: "BACKLOG";
    type: "EPIC" | "TASK";
    dueDate?: string;
    routineCadence?: "DAILY" | "WEEKLY";
    routineNextAt?: string;
  },
) => Promise<unknown>;

export const createCompleteOnboardingCommand =
  (port: CompleteOnboardingCommandPort, createTask: OnboardingTaskCreator) =>
  async (userId: string, command: CompleteOnboardingCommand) => {
    const result = await port.execute(userId, command);
    if (!result.created) return result;

    const initialTasks: Parameters<OnboardingTaskCreator>[1][] = [];
    if (command.goalTitle) {
      initialTasks.push({
        title: command.goalTitle,
        description: command.goalDescription,
        points: command.points ?? 3,
        urgency: "MEDIUM",
        risk: "MEDIUM",
        status: "BACKLOG",
        type: "EPIC",
      });
    }
    const cadence =
      command.routineCadence === "DAILY" || command.routineCadence === "WEEKLY"
        ? command.routineCadence
        : null;
    if (command.routineTitle && cadence) {
      const dueAt = new Date();
      dueAt.setDate(dueAt.getDate() + (cadence === "DAILY" ? 1 : 7));
      const nextAt = new Date(dueAt);
      nextAt.setDate(nextAt.getDate() + (cadence === "DAILY" ? 1 : 7));
      initialTasks.push({
        title: command.routineTitle,
        description: command.routineDescription,
        points: 1,
        urgency: "MEDIUM",
        risk: "LOW",
        status: "BACKLOG",
        type: "TASK",
        dueDate: dueAt.toISOString(),
        routineCadence: cadence,
        routineNextAt: nextAt.toISOString(),
      });
    }
    for (const title of (command.focusTasks ?? [])
      .map((value) => value.trim())
      .filter(Boolean)
      .slice(0, 3)) {
      initialTasks.push({
        title,
        points: 1,
        urgency: "MEDIUM",
        risk: "MEDIUM",
        status: "BACKLOG",
        type: "TASK",
      });
    }

    // Workspace creation is the onboarding transaction boundary. Optional
    // starter tasks are independent commands; one invalid suggestion must not
    // roll back or strand the new workspace.
    const taskResults = await Promise.allSettled(
      initialTasks.map((input) =>
        createTask({ userId, workspaceId: result.workspaceId, origin: "ONBOARDING" }, input),
      ),
    );
    return {
      ...result,
      starterTasksCreated: taskResults.filter(({ status }) => status === "fulfilled").length,
      starterTasksFailed: taskResults.filter(({ status }) => status === "rejected").length,
    };
  };
