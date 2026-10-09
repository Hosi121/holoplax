import { useState } from "react";
import { cn } from "@/lib/cn";
import {
  AUTOMATION_STATUS,
  TASK_WORKFLOW_STATE,
  type TaskDTO,
  type TaskWorkflowState,
} from "@/lib/types";
import { TASK_WORKFLOW_STATE_LABELS } from "@/lib/ui-language";
import { DropdownMenu } from "../../components/dropdown-menu";
import { TaskCard } from "../../components/task-card";

const columns = Object.values(TASK_WORKFLOW_STATE);

type Props = {
  items: TaskDTO[];
  members: { id: string; name: string | null }[];
  isBlocked: (task: TaskDTO) => boolean;
  onMove: (id: string, state: TaskWorkflowState) => Promise<void>;
};

export function TaskBoard({ items, members, isBlocked, onMove }: Props) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [hoverColumn, setHoverColumn] = useState<TaskWorkflowState | null>(null);
  const [moving, setMoving] = useState(false);

  const move = async (id: string, state: TaskWorkflowState) => {
    if (moving) return;
    setDraggingId(null);
    setHoverColumn(null);
    setMoving(true);
    try {
      await onMove(id, state);
    } finally {
      setMoving(false);
    }
  };

  return (
    <section aria-label="進捗ボード" aria-busy={moving} className="space-y-3">
      <p className="text-pretty text-sm text-[var(--text-secondary)]">
        完了済みも表示します。ドラッグまたはカードのメニューで進み具合を変更できます。
      </p>
      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5">
        {columns.map((state) => {
          const tasks = items.filter((item) => item.workflowState === state);
          const label = TASK_WORKFLOW_STATE_LABELS[state];
          return (
            <section
              key={state}
              aria-label={label}
              onDragOver={(event) => {
                if (!draggingId || moving) return;
                event.preventDefault();
                setHoverColumn(state);
              }}
              onDragLeave={() => setHoverColumn(null)}
              onDrop={(event) => {
                event.preventDefault();
                if (draggingId) void move(draggingId, state);
              }}
              className={cn(
                "min-w-0 border border-[var(--border)] bg-[var(--surface)] p-3",
                hoverColumn === state && "ring-2 ring-[var(--accent)]",
              )}
            >
              <div className="mb-3 flex items-center justify-between border-b border-[var(--border)] pb-3">
                <h2 className="text-balance text-sm font-semibold text-[var(--text-primary)]">
                  {label}
                </h2>
                <span className="text-xs tabular-nums text-[var(--text-muted)]">
                  {tasks.length}
                </span>
              </div>
              <div className="grid gap-3">
                {tasks.map((item) => (
                  <article key={item.id} aria-label={item.title}>
                    <TaskCard
                      item={item}
                      variant="kanban"
                      members={members}
                      isBlocked={isBlocked(item)}
                      showAiTaskBadge
                      isAiTask={
                        item.origin === "AUTOMATION" ||
                        item.automationStatus !== AUTOMATION_STATUS.NONE ||
                        item.hierarchyRole !== "STANDARD"
                      }
                      showChecklist={false}
                      showMetadata={false}
                      draggable={!moving}
                      onDragStart={(event) => {
                        setDraggingId(item.id);
                        event.dataTransfer.setData("text/plain", item.id);
                        event.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => {
                        setDraggingId(null);
                        setHoverColumn(null);
                      }}
                      isDragging={draggingId === item.id}
                      className="min-w-0 break-words"
                      renderActions={() => (
                        <DropdownMenu
                          label="進み具合を変更"
                          className="max-w-full text-xs"
                          items={columns
                            .filter((target) => target !== state)
                            .map((target) => ({
                              label: `${TASK_WORKFLOW_STATE_LABELS[target]}へ移動`,
                              loading: moving,
                              onClick: () => void move(item.id, target),
                            }))}
                        />
                      )}
                    />
                  </article>
                ))}
                {!tasks.length && (
                  <p className="text-sm text-[var(--text-muted)]">タスクはありません</p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}
