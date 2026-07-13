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
9. Workspace work survives creator lifecycle. Removing a workspace member also
   removes active assignments in that workspace.

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

## Non-goals

- Replacing Prisma or introducing distributed services.
- Event sourcing every field mutation.
- Removing the compatibility API in the same deployment as the data migration.
