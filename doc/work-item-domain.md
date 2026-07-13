# Work item lifecycle and planning model

Status: accepted for incremental migration (2026-07-13)

## Context

The original `Task.status` encoded both planning placement (`BACKLOG` or
`SPRINT`) and execution state (`DONE`). The mutable `Task.sprintId` was also
used as both current membership and historical evidence. This made velocity,
WIP, reopening, bulk completion, and task splitting disagree about the same
work item.

`Task.automationState` similarly mixed an automation workflow with structural
provenance (`SPLIT_PARENT` and `SPLIT_CHILD`). `RoutineRule` moved from one task
row to the next, so occurrences had no stable series identity.

## Decisions

1. `Task` remains the compatibility name for the core `WorkItem` aggregate.
   Renaming the table is not valuable enough to justify a flag-day migration.
2. Execution lifecycle is represented by `Task.workflowState`:
   `READY`, `IN_PROGRESS`, `BLOCKED`, `DONE`, or `CANCELED`.
3. Sprint commitment is represented by `SprintItem`, not by workflow state.
   It snapshots the committed estimate, work-item kind, and title so closed
   sprint reports do not change when the live task is edited or deleted.
4. The legacy `Task.status` and `Task.sprintId` remain during migration as API
   projections. New writes update them together with the new source of truth.
5. A split parent is an informational container and is removed from sprint
   commitment. Only its children contribute estimates after a split.
6. Work breakdown follows these rules:
   - `EPIC` has no parent and cannot be committed directly to a sprint.
   - `PBI` may have an `EPIC` parent.
   - `TASK` may have a `PBI` or `TASK` parent.
   - A container with unfinished children cannot be completed.
   - Only leaf work items may be committed, avoiding parent/child estimate
     double-counting.
7. Automation workflow and split provenance are separate concepts. Compatibility
   values remain until every client reads the separated representation.
8. Recurrence has a stable definition and occurrence identity. Completing an
   occurrence creates a new work item without moving the series identity.
   Deleting the occurrence that currently owns the active rule stops the
   series; deleting an older occurrence does not.
9. Workspace work survives creator lifecycle. Removing a workspace member also
   removes active assignments in that workspace.
10. Dependency cancellation does not satisfy a prerequisite. Removing a
    dependency explicitly changes its edge from `REQUIRED` to `WAIVED`, keeping
    the decision auditable and allowing the same edge to be reactivated.
    `TaskDependencyEvent` permanently snapshots each required, waived, and
    reactivated decision even after either live task is deleted.
11. `SprintItem` is the current commitment snapshot; `SprintItemEvent` is its
    append-only decision history. Recommit, reopen, completion, removal, and
    carryover never erase earlier decisions. A carried item links to its prior
    sprint item.
12. Workflow events snapshot the task creation date, due date, estimate, and
    creator needed by metrics. Historical metrics therefore do not join back to
    a live task that may have been deleted. Deleting active work records a final
    `CANCELED` transition before removing the task. Status events likewise
    snapshot the permanent task key and title and survive task deletion.
13. Task automation is requested by a durable, revision-deduplicated job in the
    same transaction as the task mutation. Workers claim jobs atomically, retry
    transient failures, heartbeat active claims, recover stale claims, and
    require an explicit operator action to retry terminal failures. The Node
    process starts the poller independently of user traffic, and health reports
    pending/running/failed queue counts.
14. Every state-dependent task update read and write runs in one serializable
    transaction through the shared unit-of-work adapter. Serialization
    conflicts are retried before being surfaced as an explicit conflict.
15. Single and bulk task commands use the same application lifecycle planner.
    The planner owns compatibility projection, workflow transition, and policy
    evaluation; persistence code does not define alternate rules.
16. Bulk status persistence applies the planner's projected status and workflow
    state as one explicit execution plan. Reopening `CANCELED` or `DONE` work
    through either the single or bulk command returns it to `READY`.
17. Dependency edges carry their workspace scope and both endpoints are guarded
    by composite foreign keys. Self-dependencies and cross-workspace edges are
    rejected by the database as well as the application.
18. Audit rows survive actor deletion through nullable attribution, while
    Memory claims, questions, and metrics require exactly one user or workspace
    scope. Sprint planned end dates cannot precede their start dates.

## Compatibility projection

Until clients migrate from `Task.status`:

- `DONE` projects `workflowState = DONE`.
- `SPRINT` projects an active, non-removed `SprintItem`.
- `BACKLOG` projects a non-done task without active sprint commitment.

The API may continue accepting these three values, but domain logic must use
workflow state and sprint commitment internally.

## Migration order

1. Fix known behavioral inconsistencies without a schema dependency.
2. Add and backfill `workflowState`, workflow events, and `SprintItem`.
3. Dual-write compatibility fields and new records.
4. Move reporting, capacity, and metrics reads to the new records.
5. Expose workflow controls to clients.
6. Separate automation provenance and recurring series.
7. Remove compatibility fields only after production backfill verification.
8. Validate compatibility-era database checks and retain immutable history for
   sprint and workflow reporting.

## Non-goals

- Replacing Prisma or introducing distributed services.
- Event sourcing every field mutation.
- Removing the compatibility API in the same deployment as the data migration.
