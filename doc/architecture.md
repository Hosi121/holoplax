# Architecture (Draft)

## Production (AWS / EC2)
```mermaid
flowchart LR
  User[User/Client] --> ALB[ALB (HTTP)]
  subgraph AWS[VPC (ap-northeast-3)]
    ALB --> EC2[EC2 App (Next.js/Node)]
    EC2 --> RDS[(RDS PostgreSQL)]
    EC2 --> S3[(S3 Avatar Bucket)]
    SM[Secrets Manager] --> EC2
    EC2 --> Metrics[Daily Metrics Job (uv + python)]
    Metrics --> RDS
  end
```

## Local Dev (docker-compose)
```mermaid
flowchart LR
  Dev[Developer] --> App[Next.js dev server]
  subgraph Docker[docker-compose]
    App --> PG[(Postgres 16)]
    App --> MinIO[(MinIO)]
  end
```

## Processing Flows

### Task Lifecycle + Status Events
```mermaid
flowchart LR
  User[User] --> App[App/API]
  App --> Task[WorkItem/Task]
  App --> StatusEvent[TaskStatusEvent]
  Task --> StatusEvent
  StatusEvent --> Audit[AuditLog]
  Task --> Dep[TaskDependency]
  Task --> Sprint[Sprint]
```

### Daily Metrics -> Memory Update
```mermaid
flowchart LR
  Cron[Daily Schedule] --> Job[Metrics Job (uv + python)]
  Job --> Read[Query Task + TaskStatusEvent]
  Read --> Metric[MemoryMetric (window)]
  Metric --> Claim[MemoryClaim (EMA)]
  Claim --> Question[MemoryQuestion (if confidence >= threshold)]
  Claim --> Summary[MemorySummary (periodic)]
```

### AI Collaboration Flow
```mermaid
flowchart LR
  Intake[IntakeItem] --> Proposal[AutomationProposal]
  Proposal --> Approval[ApprovalDecision]
  Approval -->|approve| Exec[AutomationExecution]
  Approval -->|reject| Log[AuditLog]
  Exec --> TaskUpdate[Task Update]
  Exec --> Suggest[AiSuggestion]
  TaskUpdate --> Log
```

### Focus Queue Computation
```mermaid
flowchart LR
  Tasks[Tasks + Dependencies] --> Score[Priority Score]
  Metrics[MemoryMetric] --> Score
  Score --> Focus[FocusQueue (Top 3)]
```
