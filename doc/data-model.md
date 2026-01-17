
  1. コアモデル（Objective/WorkItem/Sprint/Dependency の整理）
  2. Memory（User/Workspaceの情報をどう構造化するか）
  3. AI提案/承認/実行のイベントモデル

  1) コアモデル（Objective / WorkItem / Sprint / Dependency）

  - Objective（目標）
      - fields: id, workspaceId, title, description, horizon, successCriteria, status, createdAt, updatedAt
      - 役割: 長期の成果軸。PBI/EPICが紐づく起点
  - WorkItem（現行Taskを拡張して統合）
      - fields: id, workspaceId, title, description, type(EPIC/PBI/TASK/ROUTINE), parentId, status(BACKLOG/
  SPRINT/DONE), points, urgency, risk, dueDate, tags, assigneeId, sprintId, createdAt, updatedAt
      - 役割: 実務の核。親子で階層を表現
  - Dependency（TaskDependency）
      - fields: taskId, dependsOnId
      - 役割: ブロッカー判定
  - Sprint
      - fields: id, workspaceId, name, status, capacityPoints, startedAt, plannedEndAt, endedAt
      - 役割: コミットの枠
  - SprintMetrics（追加案）
      - fields: sprintId, committedPoints, completedPoints, carryoverPoints, velocity, wipAvg
      - 役割: ベロシティの「持続性」を測る基盤
  - RoutineRule（追加案）
      - fields: workItemId, cadence(daily/weekly), nextAt, timezone
      - 役割: ルーティン再発生のルール
  - 主要ルール（合意）
      - EPICはバックログに留め、Sprintに直接入れない
      - ROUTINEはSprintに混ぜてもOK（別枠も許容）
      - 依存未完了は SPRINT/DONE へ移動不可

  2) Memoryモデル（User / Workspace）

  - MemoryType（カタログ）
      - fields: id, key, scope(user/workspace), valueType, unit?, granularity, updatePolicy, decayDays,
  description
      - 例: key=deadline_adherence_30d, valueType=ratio, granularity=daily, decayDays=30
  - MemoryClaim（現在値）
      - fields: id, scope(user/workspace), typeId, value(string/number/bool/json), source(explicit/inferred),
  confidence, status(active/rejected/stale), validFrom, validTo?, evidence?, createdAt, updatedAt
      - 役割: 静的/半静的な情報の最新値。UserMemory/WorkspaceMemory はここに統合
  - MemoryMetric（時系列）
      - fields: id, scope(user/workspace), typeId, windowStart, windowEnd, value, computedAt
      - 役割: 動的な傾向の期間集計（rollingやEMA前提）
  - MemoryQuestion（確認モーダル）
      - fields: id, scope(user/workspace), memoryType, hypothesisValue, confidence, status(pending/accepted/
  rejected), createdAt
      - 確信度0.7以上で提示、ユーザーが肯定/否定/保留
  - MemorySummary（要約）
      - fields: id, scope, summaryText, periodStart, periodEnd
      - 「最近の傾向」の短い要約に使う
  - 最小セット（合意）
      - 実行パターン、生活リズム、期限厳しさ

  Mermaid（Memory構成図）
  ```mermaid
  erDiagram
    MEMORY_TYPE ||--o{ MEMORY_CLAIM : "typeId"
    MEMORY_TYPE ||--o{ MEMORY_METRIC : "typeId"
    USER ||--o{ MEMORY_CLAIM : "userId"
    WORKSPACE ||--o{ MEMORY_CLAIM : "workspaceId"
    USER ||--o{ MEMORY_METRIC : "userId"
    WORKSPACE ||--o{ MEMORY_METRIC : "workspaceId"
    MEMORY_CLAIM ||--o{ MEMORY_QUESTION : "typeId (hypothesis)"
  ```

  3) AI提案 / 承認 / 実行モデル

  - IntakeItem
      - fields: id, workspaceId, source(slack/discord/manual), payload, createdAt
  - AutomationProposal
      - fields: id, taskId, type(split/score/prep), rationale, confidence, createdAt
  - ApprovalDecision
      - fields: id, proposalId, decision(approve/reject/hold), actorId, createdAt
  - AutomationExecution
      - fields: id, proposalId, resultType(draft_email/impl_plan/checklist), output, createdAt
      - 「実行」といっても下準備アウトプットの生成までに限定
  - AiSuggestion（現行）
      - 生成物の保存（アーティファクト）
  - AuditLog（現行）
      - AI使用のコスト/トークン/モデル/プロバイダの監査
  - FocusQueue（やるべきこと3件）
      - fields: id, workspaceId, items[taskId], priorityScore, dueScore, reason, computedAt
      - priority = score0.7 + dueScore0.3（dueScore線形）
