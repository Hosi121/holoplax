// Native D1 field encoding and relation metadata. SQL constraints live in migrations.
export const schema = {
  User: {
    fields: {
      id: {
        kind: "string",
        nullable: false,
        default: {
          generated: "id",
        },
      },
      name: {
        kind: "string",
        nullable: true,
      },
      email: {
        kind: "string",
        nullable: true,
      },
      emailVerified: {
        kind: "date",
        nullable: true,
      },
      image: {
        kind: "string",
        nullable: true,
      },
      role: {
        kind: "string",
        nullable: false,
        default: "USER",
      },
      disabledAt: {
        kind: "date",
        nullable: true,
      },
      onboardingCompletedAt: {
        kind: "date",
        nullable: true,
      },
      passwordChangedAt: {
        kind: "date",
        nullable: true,
      },
      createdAt: {
        kind: "date",
        nullable: false,
        default: {
          generated: "now",
        },
      },
      updatedAt: {
        kind: "date",
        nullable: false,
        updated: true,
      },
    },
    relations: {
      accounts: {
        table: "Account",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["userId"],
      },
      sessions: {
        table: "Session",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["userId"],
      },
      memberships: {
        table: "WorkspaceMember",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["userId"],
      },
      workspacesOwned: {
        table: "Workspace",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["ownerId"],
      },
      password: {
        table: "UserPassword",
        many: false,
        nullable: true,
        local: ["id"],
        foreign: ["userId"],
      },
      emailTokens: {
        table: "EmailVerificationToken",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["userId"],
      },
      resetTokens: {
        table: "PasswordResetToken",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["userId"],
      },
      auditLogsAsActor: {
        table: "AuditLog",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["actorId"],
      },
      auditLogsAsTarget: {
        table: "AuditLog",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["targetUserId"],
      },
      tasks: {
        table: "Task",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["userId"],
      },
      assignedTasks: {
        table: "Task",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["assigneeId"],
      },
      velocityEntries: {
        table: "VelocityEntry",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["userId"],
      },
      userAutomationSettings: {
        table: "UserAutomationSetting",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["userId"],
      },
      aiSuggestions: {
        table: "AiSuggestion",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["userId"],
      },
      aiPrepOutputs: {
        table: "AiPrepOutput",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["userId"],
      },
      aiUsages: {
        table: "AiUsage",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["userId"],
      },
      sprints: {
        table: "Sprint",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["userId"],
      },
      intakeItems: {
        table: "IntakeItem",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["userId"],
      },
      taskStatusEvents: {
        table: "TaskStatusEvent",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["actorId"],
      },
      taskWorkflowEvents: {
        table: "TaskWorkflowEvent",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["actorId"],
      },
      taskDependencyEvents: {
        table: "TaskDependencyEvent",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["actorId"],
      },
      taskAutomationJobs: {
        table: "TaskAutomationJob",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["requestedById"],
      },
      delegationJobs: {
        table: "DelegationJob",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["userId"],
      },
      memoryClaims: {
        table: "MemoryClaim",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["userId"],
      },
      memoryMetrics: {
        table: "MemoryMetric",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["userId"],
      },
      memoryQuestions: {
        table: "MemoryQuestion",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["userId"],
      },
      automationStageHistories: {
        table: "AutomationStageHistory",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["userId"],
      },
      aiSuggestionReactions: {
        table: "AiSuggestionReaction",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["userId"],
      },
      taskComments: {
        table: "TaskComment",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["authorId"],
      },
      routineSeriesCreated: {
        table: "RoutineSeries",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["createdById"],
      },
      mcpApiKeys: {
        table: "McpApiKey",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["userId"],
      },
    },
    primary: ["id"],
    unique: [["email"]],
  },
  Account: {
    fields: {
      id: {
        kind: "string",
        nullable: false,
        default: {
          generated: "id",
        },
      },
      userId: {
        kind: "string",
        nullable: false,
      },
      type: {
        kind: "string",
        nullable: false,
      },
      provider: {
        kind: "string",
        nullable: false,
      },
      providerAccountId: {
        kind: "string",
        nullable: false,
      },
      refresh_token: {
        kind: "string",
        nullable: true,
      },
      access_token: {
        kind: "string",
        nullable: true,
      },
      expires_at: {
        kind: "number",
        nullable: true,
      },
      token_type: {
        kind: "string",
        nullable: true,
      },
      scope: {
        kind: "string",
        nullable: true,
      },
      id_token: {
        kind: "string",
        nullable: true,
      },
      session_state: {
        kind: "string",
        nullable: true,
      },
      createdAt: {
        kind: "date",
        nullable: false,
        default: {
          generated: "now",
        },
      },
      updatedAt: {
        kind: "date",
        nullable: false,
        updated: true,
      },
    },
    relations: {
      user: {
        table: "User",
        many: false,
        nullable: false,
        local: ["userId"],
        foreign: ["id"],
        onDelete: "Cascade",
      },
    },
    primary: ["id"],
    unique: [["provider", "providerAccountId"]],
  },
  Session: {
    fields: {
      id: {
        kind: "string",
        nullable: false,
        default: {
          generated: "id",
        },
      },
      sessionToken: {
        kind: "string",
        nullable: false,
      },
      userId: {
        kind: "string",
        nullable: false,
      },
      expires: {
        kind: "date",
        nullable: false,
      },
      createdAt: {
        kind: "date",
        nullable: false,
        default: {
          generated: "now",
        },
      },
      updatedAt: {
        kind: "date",
        nullable: false,
        updated: true,
      },
    },
    relations: {
      user: {
        table: "User",
        many: false,
        nullable: false,
        local: ["userId"],
        foreign: ["id"],
        onDelete: "Cascade",
      },
    },
    primary: ["id"],
    unique: [["sessionToken"]],
  },
  UserPassword: {
    fields: {
      id: {
        kind: "string",
        nullable: false,
        default: {
          generated: "id",
        },
      },
      userId: {
        kind: "string",
        nullable: false,
      },
      hash: {
        kind: "string",
        nullable: false,
      },
      createdAt: {
        kind: "date",
        nullable: false,
        default: {
          generated: "now",
        },
      },
      updatedAt: {
        kind: "date",
        nullable: false,
        updated: true,
      },
    },
    relations: {
      user: {
        table: "User",
        many: false,
        nullable: false,
        local: ["userId"],
        foreign: ["id"],
        onDelete: "Cascade",
      },
    },
    primary: ["id"],
    unique: [["userId"]],
  },
  EmailVerificationToken: {
    fields: {
      id: {
        kind: "string",
        nullable: false,
        default: {
          generated: "id",
        },
      },
      userId: {
        kind: "string",
        nullable: false,
      },
      token: {
        kind: "string",
        nullable: false,
      },
      expiresAt: {
        kind: "date",
        nullable: false,
      },
      createdAt: {
        kind: "date",
        nullable: false,
        default: {
          generated: "now",
        },
      },
    },
    relations: {
      user: {
        table: "User",
        many: false,
        nullable: false,
        local: ["userId"],
        foreign: ["id"],
        onDelete: "Cascade",
      },
    },
    primary: ["id"],
    unique: [["token"]],
  },
  PasswordResetToken: {
    fields: {
      id: {
        kind: "string",
        nullable: false,
        default: {
          generated: "id",
        },
      },
      userId: {
        kind: "string",
        nullable: false,
      },
      token: {
        kind: "string",
        nullable: false,
      },
      expiresAt: {
        kind: "date",
        nullable: false,
      },
      used: {
        kind: "boolean",
        nullable: false,
        default: false,
      },
      createdAt: {
        kind: "date",
        nullable: false,
        default: {
          generated: "now",
        },
      },
    },
    relations: {
      user: {
        table: "User",
        many: false,
        nullable: false,
        local: ["userId"],
        foreign: ["id"],
        onDelete: "Cascade",
      },
    },
    primary: ["id"],
    unique: [["token"]],
  },
  VerificationToken: {
    fields: {
      identifier: {
        kind: "string",
        nullable: false,
      },
      token: {
        kind: "string",
        nullable: false,
      },
      expires: {
        kind: "date",
        nullable: false,
      },
    },
    relations: {},
    primary: ["token"],
    unique: [["token"], ["identifier", "token"]],
  },
  Workspace: {
    fields: {
      id: {
        kind: "string",
        nullable: false,
        default: {
          generated: "id",
        },
      },
      name: {
        kind: "string",
        nullable: false,
      },
      ownerId: {
        kind: "string",
        nullable: false,
      },
      createdAt: {
        kind: "date",
        nullable: false,
        default: {
          generated: "now",
        },
      },
      updatedAt: {
        kind: "date",
        nullable: false,
        updated: true,
      },
    },
    relations: {
      owner: {
        table: "User",
        many: false,
        nullable: false,
        local: ["ownerId"],
        foreign: ["id"],
        onDelete: "Restrict",
      },
      members: {
        table: "WorkspaceMember",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["workspaceId"],
      },
      tasks: {
        table: "Task",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["workspaceId"],
      },
      velocityEntries: {
        table: "VelocityEntry",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["workspaceId"],
      },
      userAutomationSettings: {
        table: "UserAutomationSetting",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["workspaceId"],
      },
      aiSuggestions: {
        table: "AiSuggestion",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["workspaceId"],
      },
      aiPrepOutputs: {
        table: "AiPrepOutput",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["workspaceId"],
      },
      aiUsages: {
        table: "AiUsage",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["workspaceId"],
      },
      invites: {
        table: "WorkspaceInvite",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["workspaceId"],
      },
      auditLogs: {
        table: "AuditLog",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["targetWorkspaceId"],
      },
      sprints: {
        table: "Sprint",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["workspaceId"],
      },
      intakeItems: {
        table: "IntakeItem",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["workspaceId"],
      },
      statusEvents: {
        table: "TaskStatusEvent",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["workspaceId"],
      },
      workflowEvents: {
        table: "TaskWorkflowEvent",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["workspaceId"],
      },
      dependencyEvents: {
        table: "TaskDependencyEvent",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["workspaceId"],
      },
      memoryClaims: {
        table: "MemoryClaim",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["workspaceId"],
      },
      memoryMetrics: {
        table: "MemoryMetric",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["workspaceId"],
      },
      memoryQuestions: {
        table: "MemoryQuestion",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["workspaceId"],
      },
      automationStageHistories: {
        table: "AutomationStageHistory",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["workspaceId"],
      },
      aiSuggestionReactions: {
        table: "AiSuggestionReaction",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["workspaceId"],
      },
      taskComments: {
        table: "TaskComment",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["workspaceId"],
      },
      routineSeries: {
        table: "RoutineSeries",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["workspaceId"],
      },
      taskAutomationJobs: {
        table: "TaskAutomationJob",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["workspaceId"],
      },
      delegationJobs: {
        table: "DelegationJob",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["workspaceId"],
      },
      mcpApiKeys: {
        table: "McpApiKey",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["workspaceId"],
      },
    },
    primary: ["id"],
    unique: [],
  },
  WorkspaceMember: {
    fields: {
      id: {
        kind: "string",
        nullable: false,
        default: {
          generated: "id",
        },
      },
      workspaceId: {
        kind: "string",
        nullable: false,
      },
      userId: {
        kind: "string",
        nullable: false,
      },
      role: {
        kind: "string",
        nullable: false,
        default: "member",
      },
      createdAt: {
        kind: "date",
        nullable: false,
        default: {
          generated: "now",
        },
      },
    },
    relations: {
      workspace: {
        table: "Workspace",
        many: false,
        nullable: false,
        local: ["workspaceId"],
        foreign: ["id"],
        onDelete: "Cascade",
      },
      user: {
        table: "User",
        many: false,
        nullable: false,
        local: ["userId"],
        foreign: ["id"],
        onDelete: "Cascade",
      },
    },
    primary: ["id"],
    unique: [["workspaceId", "userId"]],
  },
  WorkspaceInvite: {
    fields: {
      id: {
        kind: "string",
        nullable: false,
        default: {
          generated: "id",
        },
      },
      workspaceId: {
        kind: "string",
        nullable: false,
      },
      email: {
        kind: "string",
        nullable: false,
      },
      role: {
        kind: "string",
        nullable: false,
        default: "member",
      },
      token: {
        kind: "string",
        nullable: false,
      },
      expiresAt: {
        kind: "date",
        nullable: false,
      },
      acceptedAt: {
        kind: "date",
        nullable: true,
      },
      createdAt: {
        kind: "date",
        nullable: false,
        default: {
          generated: "now",
        },
      },
    },
    relations: {
      workspace: {
        table: "Workspace",
        many: false,
        nullable: false,
        local: ["workspaceId"],
        foreign: ["id"],
        onDelete: "Cascade",
      },
    },
    primary: ["id"],
    unique: [["token"]],
  },
  AuditLog: {
    fields: {
      id: {
        kind: "string",
        nullable: false,
        default: {
          generated: "id",
        },
      },
      actorId: {
        kind: "string",
        nullable: true,
      },
      action: {
        kind: "string",
        nullable: false,
      },
      targetUserId: {
        kind: "string",
        nullable: true,
      },
      targetWorkspaceId: {
        kind: "string",
        nullable: true,
      },
      metadata: {
        kind: "json",
        nullable: true,
      },
      createdAt: {
        kind: "date",
        nullable: false,
        default: {
          generated: "now",
        },
      },
    },
    relations: {
      actor: {
        table: "User",
        many: false,
        nullable: true,
        local: ["actorId"],
        foreign: ["id"],
        onDelete: "SetNull",
      },
      targetUser: {
        table: "User",
        many: false,
        nullable: true,
        local: ["targetUserId"],
        foreign: ["id"],
        onDelete: "SetNull",
      },
      targetWorkspace: {
        table: "Workspace",
        many: false,
        nullable: true,
        local: ["targetWorkspaceId"],
        foreign: ["id"],
        onDelete: "SetNull",
      },
    },
    primary: ["id"],
    unique: [],
  },
  Task: {
    fields: {
      id: {
        kind: "string",
        nullable: false,
        default: {
          generated: "id",
        },
      },
      title: {
        kind: "string",
        nullable: false,
      },
      description: {
        kind: "string",
        nullable: false,
        default: "",
      },
      definitionOfDone: {
        kind: "string",
        nullable: false,
        default: "",
      },
      checklist: {
        kind: "json",
        nullable: true,
      },
      points: {
        kind: "number",
        nullable: false,
      },
      urgency: {
        kind: "string",
        nullable: false,
        default: "MEDIUM",
      },
      risk: {
        kind: "string",
        nullable: false,
        default: "MEDIUM",
      },
      workflowState: {
        kind: "string",
        nullable: false,
        default: "READY",
      },
      type: {
        kind: "string",
        nullable: false,
        default: "PBI",
      },
      automationStatus: {
        kind: "string",
        nullable: false,
        default: "NONE",
      },
      hierarchyRole: {
        kind: "string",
        nullable: false,
        default: "STANDARD",
      },
      origin: {
        kind: "string",
        nullable: false,
        default: "MANUAL",
      },
      parentId: {
        kind: "string",
        nullable: true,
      },
      sprintId: {
        kind: "string",
        nullable: true,
      },
      routineSeriesId: {
        kind: "string",
        nullable: true,
      },
      dueDate: {
        kind: "date",
        nullable: true,
      },
      assigneeId: {
        kind: "string",
        nullable: true,
      },
      tags: {
        kind: "array",
        nullable: false,
        default: [],
      },
      createdAt: {
        kind: "date",
        nullable: false,
        default: {
          generated: "now",
        },
      },
      updatedAt: {
        kind: "date",
        nullable: false,
        updated: true,
      },
      userId: {
        kind: "string",
        nullable: true,
      },
      workspaceId: {
        kind: "string",
        nullable: false,
      },
    },
    relations: {
      suggestions: {
        table: "AiSuggestion",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["taskId"],
      },
      prepOutputs: {
        table: "AiPrepOutput",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["taskId"],
      },
      sprint: {
        table: "Sprint",
        many: false,
        nullable: true,
        local: ["sprintId"],
        foreign: ["id"],
        onDelete: "SetNull",
      },
      assignee: {
        table: "User",
        many: false,
        nullable: true,
        local: ["assigneeId"],
        foreign: ["id"],
        onDelete: "SetNull",
      },
      user: {
        table: "User",
        many: false,
        nullable: true,
        local: ["userId"],
        foreign: ["id"],
        onDelete: "SetNull",
      },
      workspace: {
        table: "Workspace",
        many: false,
        nullable: false,
        local: ["workspaceId"],
        foreign: ["id"],
        onDelete: "Cascade",
      },
      parent: {
        table: "Task",
        many: false,
        nullable: true,
        local: ["parentId"],
        foreign: ["id"],
        onDelete: "SetNull",
      },
      children: {
        table: "Task",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["parentId"],
      },
      dependencies: {
        table: "TaskDependency",
        many: true,
        nullable: false,
        local: ["id", "workspaceId"],
        foreign: ["taskId", "workspaceId"],
      },
      dependents: {
        table: "TaskDependency",
        many: true,
        nullable: false,
        local: ["id", "workspaceId"],
        foreign: ["dependsOnId", "workspaceId"],
      },
      dependencyEventsAsTask: {
        table: "TaskDependencyEvent",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["taskId"],
      },
      dependencyEventsAsPrerequisite: {
        table: "TaskDependencyEvent",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["dependsOnId"],
      },
      intakeItems: {
        table: "IntakeItem",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["taskId"],
      },
      statusEvents: {
        table: "TaskStatusEvent",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["taskId"],
      },
      workflowEvents: {
        table: "TaskWorkflowEvent",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["taskId"],
      },
      sprintItems: {
        table: "SprintItem",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["taskId"],
      },
      automationJobs: {
        table: "TaskAutomationJob",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["taskId"],
      },
      routineRule: {
        table: "RoutineRule",
        many: false,
        nullable: true,
        local: ["id"],
        foreign: ["taskId"],
      },
      routineSeries: {
        table: "RoutineSeries",
        many: false,
        nullable: true,
        local: ["routineSeriesId"],
        foreign: ["id"],
        onDelete: "SetNull",
      },
      comments: {
        table: "TaskComment",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["taskId"],
      },
    },
    primary: ["id"],
    unique: [["id", "workspaceId"]],
  },
  VelocityEntry: {
    fields: {
      id: {
        kind: "string",
        nullable: false,
        default: {
          generated: "id",
        },
      },
      name: {
        kind: "string",
        nullable: false,
      },
      points: {
        kind: "number",
        nullable: false,
      },
      range: {
        kind: "string",
        nullable: false,
      },
      createdAt: {
        kind: "date",
        nullable: false,
        default: {
          generated: "now",
        },
      },
      userId: {
        kind: "string",
        nullable: true,
      },
      workspaceId: {
        kind: "string",
        nullable: true,
      },
      sprintId: {
        kind: "string",
        nullable: true,
      },
    },
    relations: {
      user: {
        table: "User",
        many: false,
        nullable: true,
        local: ["userId"],
        foreign: ["id"],
        onDelete: "SetNull",
      },
      workspace: {
        table: "Workspace",
        many: false,
        nullable: true,
        local: ["workspaceId"],
        foreign: ["id"],
        onDelete: "Cascade",
      },
      sprint: {
        table: "Sprint",
        many: false,
        nullable: true,
        local: ["sprintId"],
        foreign: ["id"],
        onDelete: "SetNull",
      },
    },
    primary: ["id"],
    unique: [["sprintId"]],
  },
  AiProviderSetting: {
    fields: {
      id: {
        kind: "number",
        nullable: false,
        default: 1,
      },
      model: {
        kind: "string",
        nullable: false,
      },
      apiKey: {
        kind: "string",
        nullable: false,
      },
      baseUrl: {
        kind: "string",
        nullable: true,
      },
      enabled: {
        kind: "boolean",
        nullable: false,
        default: true,
      },
      createdAt: {
        kind: "date",
        nullable: false,
        default: {
          generated: "now",
        },
      },
      updatedAt: {
        kind: "date",
        nullable: false,
        updated: true,
      },
    },
    relations: {},
    primary: ["id"],
    unique: [],
  },
  AiPricing: {
    fields: {
      id: {
        kind: "string",
        nullable: false,
        default: {
          generated: "id",
        },
      },
      provider: {
        kind: "string",
        nullable: false,
      },
      model: {
        kind: "string",
        nullable: false,
      },
      inputUsdPerM: {
        kind: "number",
        nullable: false,
      },
      outputUsdPerM: {
        kind: "number",
        nullable: false,
      },
      createdAt: {
        kind: "date",
        nullable: false,
        default: {
          generated: "now",
        },
      },
      updatedAt: {
        kind: "date",
        nullable: false,
        updated: true,
      },
    },
    relations: {},
    primary: ["id"],
    unique: [["provider", "model"]],
  },
  UserAutomationSetting: {
    fields: {
      id: {
        kind: "string",
        nullable: false,
        default: {
          generated: "id",
        },
      },
      low: {
        kind: "number",
        nullable: false,
      },
      high: {
        kind: "number",
        nullable: false,
      },
      stage: {
        kind: "number",
        nullable: false,
        default: 0,
      },
      lastStageAt: {
        kind: "date",
        nullable: true,
      },
      updatedAt: {
        kind: "date",
        nullable: false,
        updated: true,
      },
      createdAt: {
        kind: "date",
        nullable: false,
        default: {
          generated: "now",
        },
      },
      userId: {
        kind: "string",
        nullable: false,
      },
      workspaceId: {
        kind: "string",
        nullable: false,
      },
    },
    relations: {
      user: {
        table: "User",
        many: false,
        nullable: false,
        local: ["userId"],
        foreign: ["id"],
        onDelete: "Cascade",
      },
      workspace: {
        table: "Workspace",
        many: false,
        nullable: false,
        local: ["workspaceId"],
        foreign: ["id"],
        onDelete: "Cascade",
      },
    },
    primary: ["id"],
    unique: [["userId", "workspaceId"]],
  },
  AutomationStageHistory: {
    fields: {
      id: {
        kind: "string",
        nullable: false,
        default: {
          generated: "id",
        },
      },
      userId: {
        kind: "string",
        nullable: false,
      },
      workspaceId: {
        kind: "string",
        nullable: true,
      },
      stage: {
        kind: "number",
        nullable: false,
      },
      reason: {
        kind: "string",
        nullable: true,
      },
      createdAt: {
        kind: "date",
        nullable: false,
        default: {
          generated: "now",
        },
      },
    },
    relations: {
      user: {
        table: "User",
        many: false,
        nullable: false,
        local: ["userId"],
        foreign: ["id"],
        onDelete: "Cascade",
      },
      workspace: {
        table: "Workspace",
        many: false,
        nullable: true,
        local: ["workspaceId"],
        foreign: ["id"],
        onDelete: "Cascade",
      },
    },
    primary: ["id"],
    unique: [],
  },
  RoutineRule: {
    fields: {
      id: {
        kind: "string",
        nullable: false,
        default: {
          generated: "id",
        },
      },
      taskId: {
        kind: "string",
        nullable: false,
      },
      seriesId: {
        kind: "string",
        nullable: false,
      },
      cadence: {
        kind: "string",
        nullable: false,
      },
      nextAt: {
        kind: "date",
        nullable: false,
      },
      timezone: {
        kind: "string",
        nullable: false,
        default: "UTC",
      },
      createdAt: {
        kind: "date",
        nullable: false,
        default: {
          generated: "now",
        },
      },
      updatedAt: {
        kind: "date",
        nullable: false,
        updated: true,
      },
    },
    relations: {
      task: {
        table: "Task",
        many: false,
        nullable: false,
        local: ["taskId"],
        foreign: ["id"],
        onDelete: "Cascade",
      },
      series: {
        table: "RoutineSeries",
        many: false,
        nullable: false,
        local: ["seriesId"],
        foreign: ["id"],
        onDelete: "Cascade",
      },
    },
    primary: ["id"],
    unique: [["taskId"], ["seriesId"]],
  },
  RoutineSeries: {
    fields: {
      id: {
        kind: "string",
        nullable: false,
        default: {
          generated: "id",
        },
      },
      cadence: {
        kind: "string",
        nullable: false,
      },
      nextAt: {
        kind: "date",
        nullable: false,
      },
      timezone: {
        kind: "string",
        nullable: false,
        default: "UTC",
      },
      active: {
        kind: "boolean",
        nullable: false,
        default: true,
      },
      workspaceId: {
        kind: "string",
        nullable: false,
      },
      createdById: {
        kind: "string",
        nullable: true,
      },
      createdAt: {
        kind: "date",
        nullable: false,
        default: {
          generated: "now",
        },
      },
      updatedAt: {
        kind: "date",
        nullable: false,
        updated: true,
      },
    },
    relations: {
      workspace: {
        table: "Workspace",
        many: false,
        nullable: false,
        local: ["workspaceId"],
        foreign: ["id"],
        onDelete: "Cascade",
      },
      createdBy: {
        table: "User",
        many: false,
        nullable: true,
        local: ["createdById"],
        foreign: ["id"],
        onDelete: "SetNull",
      },
      tasks: {
        table: "Task",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["routineSeriesId"],
      },
      rule: {
        table: "RoutineRule",
        many: false,
        nullable: true,
        local: ["id"],
        foreign: ["seriesId"],
      },
    },
    primary: ["id"],
    unique: [],
  },
  AiSuggestion: {
    fields: {
      id: {
        kind: "string",
        nullable: false,
        default: {
          generated: "id",
        },
      },
      type: {
        kind: "string",
        nullable: false,
      },
      taskId: {
        kind: "string",
        nullable: true,
      },
      inputTitle: {
        kind: "string",
        nullable: false,
      },
      inputDescription: {
        kind: "string",
        nullable: false,
      },
      output: {
        kind: "string",
        nullable: false,
      },
      createdAt: {
        kind: "date",
        nullable: false,
        default: {
          generated: "now",
        },
      },
      userId: {
        kind: "string",
        nullable: true,
      },
      workspaceId: {
        kind: "string",
        nullable: true,
      },
    },
    relations: {
      task: {
        table: "Task",
        many: false,
        nullable: true,
        local: ["taskId"],
        foreign: ["id"],
        onDelete: "Cascade",
      },
      user: {
        table: "User",
        many: false,
        nullable: true,
        local: ["userId"],
        foreign: ["id"],
        onDelete: "Cascade",
      },
      workspace: {
        table: "Workspace",
        many: false,
        nullable: true,
        local: ["workspaceId"],
        foreign: ["id"],
        onDelete: "Cascade",
      },
      reactions: {
        table: "AiSuggestionReaction",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["suggestionId"],
      },
    },
    primary: ["id"],
    unique: [],
  },
  AiSuggestionReaction: {
    fields: {
      id: {
        kind: "string",
        nullable: false,
        default: {
          generated: "id",
        },
      },
      suggestionId: {
        kind: "string",
        nullable: false,
      },
      reaction: {
        kind: "string",
        nullable: false,
      },
      taskType: {
        kind: "string",
        nullable: true,
      },
      taskPoints: {
        kind: "number",
        nullable: true,
      },
      hourOfDay: {
        kind: "number",
        nullable: true,
      },
      dayOfWeek: {
        kind: "number",
        nullable: true,
      },
      wipCount: {
        kind: "number",
        nullable: true,
      },
      flowState: {
        kind: "number",
        nullable: true,
      },
      modification: {
        kind: "json",
        nullable: true,
      },
      viewedAt: {
        kind: "date",
        nullable: true,
      },
      reactedAt: {
        kind: "date",
        nullable: true,
      },
      latencyMs: {
        kind: "number",
        nullable: true,
      },
      userId: {
        kind: "string",
        nullable: false,
      },
      workspaceId: {
        kind: "string",
        nullable: true,
      },
      createdAt: {
        kind: "date",
        nullable: false,
        default: {
          generated: "now",
        },
      },
    },
    relations: {
      suggestion: {
        table: "AiSuggestion",
        many: false,
        nullable: false,
        local: ["suggestionId"],
        foreign: ["id"],
        onDelete: "Cascade",
      },
      user: {
        table: "User",
        many: false,
        nullable: false,
        local: ["userId"],
        foreign: ["id"],
        onDelete: "Cascade",
      },
      workspace: {
        table: "Workspace",
        many: false,
        nullable: true,
        local: ["workspaceId"],
        foreign: ["id"],
        onDelete: "Cascade",
      },
    },
    primary: ["id"],
    unique: [],
  },
  AiPrepOutput: {
    fields: {
      id: {
        kind: "string",
        nullable: false,
        default: {
          generated: "id",
        },
      },
      type: {
        kind: "string",
        nullable: false,
      },
      status: {
        kind: "string",
        nullable: false,
        default: "PENDING",
      },
      taskId: {
        kind: "string",
        nullable: false,
      },
      output: {
        kind: "string",
        nullable: false,
      },
      createdAt: {
        kind: "date",
        nullable: false,
        default: {
          generated: "now",
        },
      },
      updatedAt: {
        kind: "date",
        nullable: false,
        updated: true,
      },
      userId: {
        kind: "string",
        nullable: true,
      },
      workspaceId: {
        kind: "string",
        nullable: true,
      },
    },
    relations: {
      task: {
        table: "Task",
        many: false,
        nullable: false,
        local: ["taskId"],
        foreign: ["id"],
        onDelete: "Cascade",
      },
      user: {
        table: "User",
        many: false,
        nullable: true,
        local: ["userId"],
        foreign: ["id"],
        onDelete: "Cascade",
      },
      workspace: {
        table: "Workspace",
        many: false,
        nullable: true,
        local: ["workspaceId"],
        foreign: ["id"],
        onDelete: "Cascade",
      },
    },
    primary: ["id"],
    unique: [],
  },
  AiUsage: {
    fields: {
      id: {
        kind: "string",
        nullable: false,
        default: {
          generated: "id",
        },
      },
      action: {
        kind: "string",
        nullable: false,
      },
      provider: {
        kind: "string",
        nullable: false,
      },
      model: {
        kind: "string",
        nullable: false,
      },
      promptTokens: {
        kind: "number",
        nullable: true,
      },
      completionTokens: {
        kind: "number",
        nullable: true,
      },
      totalTokens: {
        kind: "number",
        nullable: true,
      },
      costUsd: {
        kind: "number",
        nullable: true,
      },
      usageSource: {
        kind: "string",
        nullable: false,
      },
      feature: {
        kind: "string",
        nullable: true,
      },
      taskId: {
        kind: "string",
        nullable: true,
      },
      userId: {
        kind: "string",
        nullable: true,
      },
      workspaceId: {
        kind: "string",
        nullable: true,
      },
      createdAt: {
        kind: "date",
        nullable: false,
        default: {
          generated: "now",
        },
      },
    },
    relations: {
      user: {
        table: "User",
        many: false,
        nullable: true,
        local: ["userId"],
        foreign: ["id"],
        onDelete: "SetNull",
      },
      workspace: {
        table: "Workspace",
        many: false,
        nullable: true,
        local: ["workspaceId"],
        foreign: ["id"],
        onDelete: "SetNull",
      },
    },
    primary: ["id"],
    unique: [],
  },
  Sprint: {
    fields: {
      id: {
        kind: "string",
        nullable: false,
        default: {
          generated: "id",
        },
      },
      name: {
        kind: "string",
        nullable: false,
      },
      status: {
        kind: "string",
        nullable: false,
        default: "ACTIVE",
      },
      capacityPoints: {
        kind: "number",
        nullable: false,
      },
      startedAt: {
        kind: "date",
        nullable: false,
        default: {
          generated: "now",
        },
      },
      plannedEndAt: {
        kind: "date",
        nullable: true,
      },
      endedAt: {
        kind: "date",
        nullable: true,
      },
      userId: {
        kind: "string",
        nullable: true,
      },
      workspaceId: {
        kind: "string",
        nullable: false,
      },
      createdAt: {
        kind: "date",
        nullable: false,
        default: {
          generated: "now",
        },
      },
      updatedAt: {
        kind: "date",
        nullable: false,
        updated: true,
      },
    },
    relations: {
      user: {
        table: "User",
        many: false,
        nullable: true,
        local: ["userId"],
        foreign: ["id"],
        onDelete: "SetNull",
      },
      workspace: {
        table: "Workspace",
        many: false,
        nullable: false,
        local: ["workspaceId"],
        foreign: ["id"],
        onDelete: "Cascade",
      },
      tasks: {
        table: "Task",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["sprintId"],
      },
      items: {
        table: "SprintItem",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["sprintId"],
      },
      velocityEntry: {
        table: "VelocityEntry",
        many: false,
        nullable: true,
        local: ["id"],
        foreign: ["sprintId"],
      },
    },
    primary: ["id"],
    unique: [],
  },
  TaskDependency: {
    fields: {
      taskId: {
        kind: "string",
        nullable: false,
      },
      dependsOnId: {
        kind: "string",
        nullable: false,
      },
      workspaceId: {
        kind: "string",
        nullable: false,
      },
      state: {
        kind: "string",
        nullable: false,
        default: "REQUIRED",
      },
      waivedAt: {
        kind: "date",
        nullable: true,
      },
    },
    relations: {
      task: {
        table: "Task",
        many: false,
        nullable: false,
        local: ["taskId", "workspaceId"],
        foreign: ["id", "workspaceId"],
        onDelete: "Cascade",
      },
      dependsOn: {
        table: "Task",
        many: false,
        nullable: false,
        local: ["dependsOnId", "workspaceId"],
        foreign: ["id", "workspaceId"],
        onDelete: "Cascade",
      },
    },
    primary: ["taskId", "dependsOnId"],
    unique: [],
  },
  TaskDependencyEvent: {
    fields: {
      id: {
        kind: "string",
        nullable: false,
        default: {
          generated: "id",
        },
      },
      taskId: {
        kind: "string",
        nullable: true,
      },
      taskKey: {
        kind: "string",
        nullable: false,
      },
      dependsOnId: {
        kind: "string",
        nullable: true,
      },
      dependsOnKey: {
        kind: "string",
        nullable: false,
      },
      type: {
        kind: "string",
        nullable: false,
      },
      actorId: {
        kind: "string",
        nullable: true,
      },
      workspaceId: {
        kind: "string",
        nullable: true,
      },
      reason: {
        kind: "string",
        nullable: true,
      },
      createdAt: {
        kind: "date",
        nullable: false,
        default: {
          generated: "now",
        },
      },
    },
    relations: {
      task: {
        table: "Task",
        many: false,
        nullable: true,
        local: ["taskId"],
        foreign: ["id"],
        onDelete: "SetNull",
      },
      dependsOn: {
        table: "Task",
        many: false,
        nullable: true,
        local: ["dependsOnId"],
        foreign: ["id"],
        onDelete: "SetNull",
      },
      actor: {
        table: "User",
        many: false,
        nullable: true,
        local: ["actorId"],
        foreign: ["id"],
        onDelete: "SetNull",
      },
      workspace: {
        table: "Workspace",
        many: false,
        nullable: true,
        local: ["workspaceId"],
        foreign: ["id"],
        onDelete: "SetNull",
      },
    },
    primary: ["id"],
    unique: [],
  },
  TaskStatusEvent: {
    fields: {
      id: {
        kind: "string",
        nullable: false,
        default: {
          generated: "id",
        },
      },
      taskId: {
        kind: "string",
        nullable: true,
      },
      taskKey: {
        kind: "string",
        nullable: false,
      },
      taskTitle: {
        kind: "string",
        nullable: false,
      },
      fromStatus: {
        kind: "string",
        nullable: true,
      },
      toStatus: {
        kind: "string",
        nullable: false,
      },
      actorId: {
        kind: "string",
        nullable: true,
      },
      trigger: {
        kind: "string",
        nullable: true,
      },
      workspaceId: {
        kind: "string",
        nullable: true,
      },
      createdAt: {
        kind: "date",
        nullable: false,
        default: {
          generated: "now",
        },
      },
    },
    relations: {
      task: {
        table: "Task",
        many: false,
        nullable: true,
        local: ["taskId"],
        foreign: ["id"],
        onDelete: "SetNull",
      },
      actor: {
        table: "User",
        many: false,
        nullable: true,
        local: ["actorId"],
        foreign: ["id"],
        onDelete: "SetNull",
      },
      workspace: {
        table: "Workspace",
        many: false,
        nullable: true,
        local: ["workspaceId"],
        foreign: ["id"],
        onDelete: "SetNull",
      },
    },
    primary: ["id"],
    unique: [],
  },
  TaskWorkflowEvent: {
    fields: {
      id: {
        kind: "string",
        nullable: false,
        default: {
          generated: "id",
        },
      },
      taskId: {
        kind: "string",
        nullable: true,
      },
      taskKey: {
        kind: "string",
        nullable: false,
      },
      taskCreatedAt: {
        kind: "date",
        nullable: true,
      },
      taskDueDate: {
        kind: "date",
        nullable: true,
      },
      taskPoints: {
        kind: "number",
        nullable: true,
      },
      taskCreatorId: {
        kind: "string",
        nullable: true,
      },
      fromState: {
        kind: "string",
        nullable: true,
      },
      toState: {
        kind: "string",
        nullable: false,
      },
      actorId: {
        kind: "string",
        nullable: true,
      },
      trigger: {
        kind: "string",
        nullable: true,
      },
      workspaceId: {
        kind: "string",
        nullable: true,
      },
      createdAt: {
        kind: "date",
        nullable: false,
        default: {
          generated: "now",
        },
      },
    },
    relations: {
      task: {
        table: "Task",
        many: false,
        nullable: true,
        local: ["taskId"],
        foreign: ["id"],
        onDelete: "SetNull",
      },
      actor: {
        table: "User",
        many: false,
        nullable: true,
        local: ["actorId"],
        foreign: ["id"],
        onDelete: "SetNull",
      },
      workspace: {
        table: "Workspace",
        many: false,
        nullable: true,
        local: ["workspaceId"],
        foreign: ["id"],
        onDelete: "SetNull",
      },
    },
    primary: ["id"],
    unique: [],
  },
  SprintItem: {
    fields: {
      id: {
        kind: "string",
        nullable: false,
        default: {
          generated: "id",
        },
      },
      sprintId: {
        kind: "string",
        nullable: false,
      },
      taskId: {
        kind: "string",
        nullable: true,
      },
      taskKey: {
        kind: "string",
        nullable: false,
      },
      taskTitle: {
        kind: "string",
        nullable: false,
      },
      taskType: {
        kind: "string",
        nullable: false,
      },
      committedPoints: {
        kind: "number",
        nullable: false,
      },
      outcome: {
        kind: "string",
        nullable: false,
        default: "COMMITTED",
      },
      committedAt: {
        kind: "date",
        nullable: false,
        default: {
          generated: "now",
        },
      },
      completedAt: {
        kind: "date",
        nullable: true,
      },
      removedAt: {
        kind: "date",
        nullable: true,
      },
      carriedFromId: {
        kind: "string",
        nullable: true,
      },
    },
    relations: {
      sprint: {
        table: "Sprint",
        many: false,
        nullable: false,
        local: ["sprintId"],
        foreign: ["id"],
        onDelete: "Cascade",
      },
      task: {
        table: "Task",
        many: false,
        nullable: true,
        local: ["taskId"],
        foreign: ["id"],
        onDelete: "SetNull",
      },
      carriedFrom: {
        table: "SprintItem",
        many: false,
        nullable: true,
        local: ["carriedFromId"],
        foreign: ["id"],
        onDelete: "SetNull",
      },
      carriedItems: {
        table: "SprintItem",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["carriedFromId"],
      },
      events: {
        table: "SprintItemEvent",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["sprintItemId"],
      },
    },
    primary: ["id"],
    unique: [["sprintId", "taskKey"]],
  },
  SprintItemEvent: {
    fields: {
      id: {
        kind: "string",
        nullable: false,
        default: {
          generated: "id",
        },
      },
      sprintItemId: {
        kind: "string",
        nullable: false,
      },
      type: {
        kind: "string",
        nullable: false,
      },
      taskTitle: {
        kind: "string",
        nullable: false,
      },
      taskType: {
        kind: "string",
        nullable: false,
      },
      committedPoints: {
        kind: "number",
        nullable: false,
      },
      occurredAt: {
        kind: "date",
        nullable: false,
        default: {
          generated: "now",
        },
      },
    },
    relations: {
      sprintItem: {
        table: "SprintItem",
        many: false,
        nullable: false,
        local: ["sprintItemId"],
        foreign: ["id"],
        onDelete: "Cascade",
      },
    },
    primary: ["id"],
    unique: [],
  },
  TaskAutomationJob: {
    fields: {
      id: {
        kind: "string",
        nullable: false,
        default: {
          generated: "id",
        },
      },
      dedupeKey: {
        kind: "string",
        nullable: false,
      },
      taskId: {
        kind: "string",
        nullable: true,
      },
      taskKey: {
        kind: "string",
        nullable: false,
      },
      workspaceId: {
        kind: "string",
        nullable: false,
      },
      requestedById: {
        kind: "string",
        nullable: true,
      },
      status: {
        kind: "string",
        nullable: false,
        default: "PENDING",
      },
      attempts: {
        kind: "number",
        nullable: false,
        default: 0,
      },
      availableAt: {
        kind: "date",
        nullable: false,
        default: {
          generated: "now",
        },
      },
      lockedAt: {
        kind: "date",
        nullable: true,
      },
      lockedBy: {
        kind: "string",
        nullable: true,
      },
      lastError: {
        kind: "string",
        nullable: true,
      },
      createdAt: {
        kind: "date",
        nullable: false,
        default: {
          generated: "now",
        },
      },
      updatedAt: {
        kind: "date",
        nullable: false,
        updated: true,
      },
    },
    relations: {
      task: {
        table: "Task",
        many: false,
        nullable: true,
        local: ["taskId"],
        foreign: ["id"],
        onDelete: "SetNull",
      },
      workspace: {
        table: "Workspace",
        many: false,
        nullable: false,
        local: ["workspaceId"],
        foreign: ["id"],
        onDelete: "Cascade",
      },
      requestedBy: {
        table: "User",
        many: false,
        nullable: true,
        local: ["requestedById"],
        foreign: ["id"],
        onDelete: "SetNull",
      },
    },
    primary: ["id"],
    unique: [["dedupeKey"]],
  },
  DelegationJob: {
    fields: {
      id: {
        kind: "string",
        nullable: false,
        default: {
          generated: "id",
        },
      },
      userId: {
        kind: "string",
        nullable: false,
      },
      workspaceId: {
        kind: "string",
        nullable: true,
      },
      request: {
        kind: "string",
        nullable: false,
      },
      mode: {
        kind: "string",
        nullable: false,
        default: "SAFE_AUTO",
      },
      kind: {
        kind: "string",
        nullable: false,
      },
      risk: {
        kind: "string",
        nullable: false,
      },
      status: {
        kind: "string",
        nullable: false,
        default: "PENDING",
      },
      approvalReason: {
        kind: "string",
        nullable: true,
      },
      plan: {
        kind: "json",
        nullable: false,
      },
      result: {
        kind: "string",
        nullable: true,
      },
      verification: {
        kind: "json",
        nullable: true,
      },
      attempts: {
        kind: "number",
        nullable: false,
        default: 0,
      },
      availableAt: {
        kind: "date",
        nullable: false,
        default: {
          generated: "now",
        },
      },
      lockedAt: {
        kind: "date",
        nullable: true,
      },
      lockedBy: {
        kind: "string",
        nullable: true,
      },
      lastError: {
        kind: "string",
        nullable: true,
      },
      startedAt: {
        kind: "date",
        nullable: true,
      },
      completedAt: {
        kind: "date",
        nullable: true,
      },
      createdAt: {
        kind: "date",
        nullable: false,
        default: {
          generated: "now",
        },
      },
      updatedAt: {
        kind: "date",
        nullable: false,
        updated: true,
      },
    },
    relations: {
      user: {
        table: "User",
        many: false,
        nullable: false,
        local: ["userId"],
        foreign: ["id"],
        onDelete: "Cascade",
      },
      workspace: {
        table: "Workspace",
        many: false,
        nullable: true,
        local: ["workspaceId"],
        foreign: ["id"],
        onDelete: "SetNull",
      },
    },
    primary: ["id"],
    unique: [],
  },
  MemoryDefinition: {
    fields: {
      id: {
        kind: "string",
        nullable: false,
        default: {
          generated: "id",
        },
      },
      key: {
        kind: "string",
        nullable: false,
      },
      scope: {
        kind: "string",
        nullable: false,
      },
      valueType: {
        kind: "string",
        nullable: false,
      },
      unit: {
        kind: "string",
        nullable: true,
      },
      granularity: {
        kind: "string",
        nullable: false,
      },
      updatePolicy: {
        kind: "string",
        nullable: false,
      },
      decayDays: {
        kind: "number",
        nullable: true,
      },
      description: {
        kind: "string",
        nullable: true,
      },
      createdAt: {
        kind: "date",
        nullable: false,
        default: {
          generated: "now",
        },
      },
      updatedAt: {
        kind: "date",
        nullable: false,
        updated: true,
      },
    },
    relations: {
      claims: {
        table: "MemoryClaim",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["definitionId"],
      },
      metrics: {
        table: "MemoryMetric",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["definitionId"],
      },
      questions: {
        table: "MemoryQuestion",
        many: true,
        nullable: false,
        local: ["id"],
        foreign: ["definitionId"],
      },
    },
    primary: ["id"],
    unique: [["key", "scope"]],
  },
  MemoryClaim: {
    fields: {
      id: {
        kind: "string",
        nullable: false,
        default: {
          generated: "id",
        },
      },
      definitionId: {
        kind: "string",
        nullable: false,
      },
      userId: {
        kind: "string",
        nullable: true,
      },
      workspaceId: {
        kind: "string",
        nullable: true,
      },
      valueStr: {
        kind: "string",
        nullable: true,
      },
      valueNum: {
        kind: "number",
        nullable: true,
      },
      valueBool: {
        kind: "boolean",
        nullable: true,
      },
      valueJson: {
        kind: "json",
        nullable: true,
      },
      confidence: {
        kind: "number",
        nullable: false,
        default: 0.5,
      },
      provenance: {
        kind: "string",
        nullable: false,
        default: "INFERRED",
      },
      status: {
        kind: "string",
        nullable: false,
        default: "ACTIVE",
      },
      validFrom: {
        kind: "date",
        nullable: false,
        default: {
          generated: "now",
        },
      },
      validTo: {
        kind: "date",
        nullable: true,
      },
      evidence: {
        kind: "json",
        nullable: true,
      },
      createdAt: {
        kind: "date",
        nullable: false,
        default: {
          generated: "now",
        },
      },
      updatedAt: {
        kind: "date",
        nullable: false,
        updated: true,
      },
    },
    relations: {
      definition: {
        table: "MemoryDefinition",
        many: false,
        nullable: false,
        local: ["definitionId"],
        foreign: ["id"],
        onDelete: "Cascade",
      },
      user: {
        table: "User",
        many: false,
        nullable: true,
        local: ["userId"],
        foreign: ["id"],
        onDelete: "Cascade",
      },
      workspace: {
        table: "Workspace",
        many: false,
        nullable: true,
        local: ["workspaceId"],
        foreign: ["id"],
        onDelete: "Cascade",
      },
    },
    primary: ["id"],
    unique: [],
  },
  MemoryQuestion: {
    fields: {
      id: {
        kind: "string",
        nullable: false,
        default: {
          generated: "id",
        },
      },
      definitionId: {
        kind: "string",
        nullable: false,
      },
      userId: {
        kind: "string",
        nullable: true,
      },
      workspaceId: {
        kind: "string",
        nullable: true,
      },
      valueStr: {
        kind: "string",
        nullable: true,
      },
      valueNum: {
        kind: "number",
        nullable: true,
      },
      valueBool: {
        kind: "boolean",
        nullable: true,
      },
      valueJson: {
        kind: "json",
        nullable: true,
      },
      confidence: {
        kind: "number",
        nullable: false,
        default: 0.7,
      },
      status: {
        kind: "string",
        nullable: false,
        default: "PENDING",
      },
      createdAt: {
        kind: "date",
        nullable: false,
        default: {
          generated: "now",
        },
      },
      updatedAt: {
        kind: "date",
        nullable: false,
        updated: true,
      },
    },
    relations: {
      definition: {
        table: "MemoryDefinition",
        many: false,
        nullable: false,
        local: ["definitionId"],
        foreign: ["id"],
        onDelete: "Cascade",
      },
      user: {
        table: "User",
        many: false,
        nullable: true,
        local: ["userId"],
        foreign: ["id"],
        onDelete: "Cascade",
      },
      workspace: {
        table: "Workspace",
        many: false,
        nullable: true,
        local: ["workspaceId"],
        foreign: ["id"],
        onDelete: "Cascade",
      },
    },
    primary: ["id"],
    unique: [],
  },
  MemoryMetric: {
    fields: {
      id: {
        kind: "string",
        nullable: false,
        default: {
          generated: "id",
        },
      },
      definitionId: {
        kind: "string",
        nullable: false,
      },
      userId: {
        kind: "string",
        nullable: true,
      },
      workspaceId: {
        kind: "string",
        nullable: true,
      },
      windowStart: {
        kind: "date",
        nullable: false,
      },
      windowEnd: {
        kind: "date",
        nullable: false,
      },
      valueNum: {
        kind: "number",
        nullable: true,
      },
      valueJson: {
        kind: "json",
        nullable: true,
      },
      computedAt: {
        kind: "date",
        nullable: false,
        default: {
          generated: "now",
        },
      },
    },
    relations: {
      definition: {
        table: "MemoryDefinition",
        many: false,
        nullable: false,
        local: ["definitionId"],
        foreign: ["id"],
        onDelete: "Cascade",
      },
      user: {
        table: "User",
        many: false,
        nullable: true,
        local: ["userId"],
        foreign: ["id"],
        onDelete: "Cascade",
      },
      workspace: {
        table: "Workspace",
        many: false,
        nullable: true,
        local: ["workspaceId"],
        foreign: ["id"],
        onDelete: "Cascade",
      },
    },
    primary: ["id"],
    unique: [],
  },
  IntakeItem: {
    fields: {
      id: {
        kind: "string",
        nullable: false,
        default: {
          generated: "id",
        },
      },
      origin: {
        kind: "string",
        nullable: false,
      },
      status: {
        kind: "string",
        nullable: false,
        default: "PENDING",
      },
      title: {
        kind: "string",
        nullable: false,
      },
      body: {
        kind: "string",
        nullable: false,
      },
      payload: {
        kind: "json",
        nullable: true,
      },
      userId: {
        kind: "string",
        nullable: false,
      },
      workspaceId: {
        kind: "string",
        nullable: true,
      },
      taskId: {
        kind: "string",
        nullable: true,
      },
      createdAt: {
        kind: "date",
        nullable: false,
        default: {
          generated: "now",
        },
      },
      updatedAt: {
        kind: "date",
        nullable: false,
        updated: true,
      },
    },
    relations: {
      user: {
        table: "User",
        many: false,
        nullable: false,
        local: ["userId"],
        foreign: ["id"],
        onDelete: "Cascade",
      },
      workspace: {
        table: "Workspace",
        many: false,
        nullable: true,
        local: ["workspaceId"],
        foreign: ["id"],
        onDelete: "SetNull",
      },
      task: {
        table: "Task",
        many: false,
        nullable: true,
        local: ["taskId"],
        foreign: ["id"],
        onDelete: "SetNull",
      },
    },
    primary: ["id"],
    unique: [],
  },
  TaskComment: {
    fields: {
      id: {
        kind: "string",
        nullable: false,
        default: {
          generated: "id",
        },
      },
      taskId: {
        kind: "string",
        nullable: false,
      },
      authorId: {
        kind: "string",
        nullable: false,
      },
      workspaceId: {
        kind: "string",
        nullable: false,
      },
      content: {
        kind: "string",
        nullable: false,
      },
      editedAt: {
        kind: "date",
        nullable: true,
      },
      createdAt: {
        kind: "date",
        nullable: false,
        default: {
          generated: "now",
        },
      },
      updatedAt: {
        kind: "date",
        nullable: false,
        updated: true,
      },
    },
    relations: {
      task: {
        table: "Task",
        many: false,
        nullable: false,
        local: ["taskId"],
        foreign: ["id"],
        onDelete: "Cascade",
      },
      author: {
        table: "User",
        many: false,
        nullable: false,
        local: ["authorId"],
        foreign: ["id"],
        onDelete: "Cascade",
      },
      workspace: {
        table: "Workspace",
        many: false,
        nullable: false,
        local: ["workspaceId"],
        foreign: ["id"],
        onDelete: "Cascade",
      },
    },
    primary: ["id"],
    unique: [],
  },
  McpApiKey: {
    fields: {
      id: {
        kind: "string",
        nullable: false,
        default: {
          generated: "id",
        },
      },
      name: {
        kind: "string",
        nullable: false,
      },
      keyHash: {
        kind: "string",
        nullable: false,
      },
      keyPrefix: {
        kind: "string",
        nullable: false,
      },
      userId: {
        kind: "string",
        nullable: false,
      },
      workspaceId: {
        kind: "string",
        nullable: false,
      },
      lastUsedAt: {
        kind: "date",
        nullable: true,
      },
      expiresAt: {
        kind: "date",
        nullable: true,
      },
      revokedAt: {
        kind: "date",
        nullable: true,
      },
      createdAt: {
        kind: "date",
        nullable: false,
        default: {
          generated: "now",
        },
      },
    },
    relations: {
      user: {
        table: "User",
        many: false,
        nullable: false,
        local: ["userId"],
        foreign: ["id"],
        onDelete: "Cascade",
      },
      workspace: {
        table: "Workspace",
        many: false,
        nullable: false,
        local: ["workspaceId"],
        foreign: ["id"],
        onDelete: "Cascade",
      },
    },
    primary: ["id"],
    unique: [["keyHash"]],
  },
} as const;
