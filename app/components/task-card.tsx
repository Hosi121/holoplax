"use client";

import { BarChart2, Lightbulb, Pencil, Scissors, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import {
  AUTOMATION_STATE,
  SEVERITY_LABELS,
  type Severity,
  TASK_STATUS,
  TASK_TYPE,
  type TaskDTO,
  type TaskType,
} from "../../lib/types";
import { DropdownMenu } from "./dropdown-menu";
import { useToast } from "./toast";

const taskTypeLabels: Record<TaskType, string> = {
  [TASK_TYPE.EPIC]: "目標",
  [TASK_TYPE.PBI]: "PBI",
  [TASK_TYPE.TASK]: "タスク",
  [TASK_TYPE.ROUTINE]: "ルーティン",
};

// ============================================================
// Types
// ============================================================

export type SplitSuggestion = {
  title: string;
  points: number;
  urgency: string;
  risk: string;
  detail: string;
};

export type ScoreResult = {
  points: number;
  urgency: string;
  risk: string;
  reason?: string;
};

export type TipResult = {
  text: string;
};

export type ProactiveSuggestion = {
  type: "TIP" | "SCORE" | "SPLIT";
  reason: string;
  priority: number;
};

export type MemberInfo = {
  id: string;
  name: string | null;
};

export type AiSuggestionConfig = {
  splitThreshold: number;
  suggestLoadingId: string | null;
  scoreLoadingId: string | null;
  splitLoadingId: string | null;
  suggestion?: TipResult;
  score?: ScoreResult;
  splits?: SplitSuggestion[];
  proactiveSuggestion?: ProactiveSuggestion | null;
  onGetSuggestion: () => void;
  onEstimateScore: () => void;
  onRequestSplit: () => void;
  onApplySplit: () => void;
  onApplyTipSuggestion: () => void;
  onApplyScoreSuggestion: () => void;
  onDismissTip: () => void;
  onDismissScore: () => void;
  onDismissSplit: () => void;
  onOpenPrepModal?: () => void;
};

export type TaskCardVariant = "backlog" | "sprint" | "kanban" | "compact";

export type TaskCardProps = {
  item: TaskDTO;
  variant?: TaskCardVariant;
  // Context data
  parentTask?: TaskDTO | null;
  childCount?: number;
  members?: MemberInfo[];
  isBlocked?: boolean;
  // Display options
  showType?: boolean;
  showPoints?: boolean;
  showSeverity?: boolean;
  showChecklist?: boolean;
  showMetadata?: boolean;
  showAiTaskBadge?: boolean;
  isAiTask?: boolean;
  // AI suggestions (optional)
  aiConfig?: AiSuggestionConfig;
  // Actions
  onEdit?: () => void;
  onDelete?: () => void;
  onMoveToSprint?: () => void;
  onMoveToBacklog?: () => void;
  onMarkDone?: () => void;
  onToggleChecklistItem?: (checklistId: string) => void;
  // Custom actions slot
  renderActions?: () => ReactNode;
  // Drag support (for kanban)
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
  isDragging?: boolean;
  // Custom class
  className?: string;
};

// ============================================================
// Sub-components
// ============================================================

const ProactiveLabel = ({ type }: { type: string }) => {
  switch (type) {
    case "TIP":
      return (
        <>
          <Lightbulb size={10} />
          ヒント提案あり
        </>
      );
    case "SCORE":
      return (
        <>
          <BarChart2 size={10} />
          見積もり提案あり
        </>
      );
    case "SPLIT":
      return (
        <>
          <Scissors size={10} />
          分解提案あり
        </>
      );
    default:
      return null;
  }
};

export function Checklist({
  items,
  onToggle,
}: {
  items: { id: string; text: string; done: boolean }[];
  onToggle?: (id: string) => void;
}) {
  if (!items.length) return null;
  return (
    <div className="mt-2 grid gap-1 text-xs text-slate-600">
      {items.map((check) => (
        <label key={check.id} className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={check.done}
            onChange={() => onToggle?.(check.id)}
            disabled={!onToggle}
            className="accent-[#2323eb]"
          />
          <span className={check.done ? "line-through text-slate-400" : "text-slate-600"}>
            {check.text}
          </span>
        </label>
      ))}
    </div>
  );
}

// ============================================================
// Main Component
// ============================================================

export function TaskCard({
  item,
  variant = "backlog",
  parentTask,
  childCount = 0,
  members = [],
  isBlocked = false,
  showType = true,
  showPoints = true,
  showSeverity = true,
  showChecklist = true,
  showMetadata = true,
  showAiTaskBadge = false,
  isAiTask = false,
  aiConfig,
  onEdit,
  onDelete,
  onMoveToSprint,
  onMoveToBacklog,
  onMarkDone,
  onToggleChecklistItem,
  renderActions,
  draggable,
  onDragStart,
  onDragEnd,
  isDragging,
  className = "",
}: TaskCardProps) {
  const toast = useToast();
  const isCompact = variant === "compact";
  const isKanban = variant === "kanban";

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 ${
        isDragging ? "opacity-60" : ""
      } ${isCompact ? "bg-slate-50/70 text-slate-600" : ""} ${className}`}
    >
      {/* Header */}
      <div className={`flex items-${isKanban ? "start" : "center"} justify-between gap-2`}>
        <div className="flex items-center gap-2 min-w-0">
          <p
            className={`font-semibold break-words ${isCompact ? "text-slate-700" : "text-slate-900"}`}
          >
            {item.title}
          </p>
          {aiConfig?.proactiveSuggestion && (
            <span
              className="flex items-center gap-1 text-[10px] text-blue-600 opacity-70 shrink-0"
              title={aiConfig.proactiveSuggestion.reason}
            >
              <ProactiveLabel type={aiConfig.proactiveSuggestion.type} />
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs shrink-0">
          {showType && (
            <span
              className={`border border-slate-200 bg-white px-2 py-1 ${isCompact ? "text-slate-500" : "text-slate-600"}`}
            >
              {taskTypeLabels[(item.type ?? TASK_TYPE.PBI) as TaskType]}
            </span>
          )}
          {showAiTaskBadge && (
            <span
              className={`border px-2 py-1 text-[10px] font-semibold ${
                isAiTask
                  ? "border-amber-200 bg-amber-50 text-amber-700"
                  : "border-slate-200 bg-white text-slate-600"
              }`}
            >
              {isAiTask ? "AI" : "人"}
            </span>
          )}
          {showPoints && (
            <span
              className={`border border-slate-200 bg-white px-2 py-1 ${isCompact ? "text-slate-500" : "text-slate-700"}`}
            >
              {item.points} pt
            </span>
          )}
          {showSeverity && !isKanban && !isCompact && (
            <>
              <span className="border border-slate-200 bg-white px-2 py-1 text-slate-700">
                緊急度: {SEVERITY_LABELS[item.urgency as Severity] ?? item.urgency}
              </span>
              <span className="border border-slate-200 bg-white px-2 py-1 text-slate-700">
                リスク: {SEVERITY_LABELS[item.risk as Severity] ?? item.risk}
              </span>
            </>
          )}
          {item.automationState === AUTOMATION_STATE.PENDING_SPLIT && (
            <span className="border border-amber-200 bg-amber-50 px-2 py-1 text-amber-700">
              承認待ち
            </span>
          )}
        </div>
      </div>

      {/* Description */}
      {item.description && (
        <p
          className={`mt-1 break-words ${isCompact ? "text-xs text-slate-500" : "text-sm text-slate-700"}`}
        >
          {item.description}
        </p>
      )}

      {/* Definition of Done */}
      {!isCompact && item.definitionOfDone && (
        <p className="mt-1 text-xs text-slate-500">完了条件: {item.definitionOfDone}</p>
      )}

      {/* Checklist */}
      {showChecklist && !isCompact && item.checklist && item.checklist.length > 0 && (
        <Checklist
          items={item.checklist}
          onToggle={onToggleChecklistItem ? (id) => onToggleChecklistItem(id) : undefined}
        />
      )}

      {/* Dependencies (for kanban/sprint inline display) */}
      {(isKanban || variant === "sprint") && item.dependencies && item.dependencies.length > 0 && (
        <p
          className={`mt-1 text-xs break-words ${isBlocked ? "text-amber-700" : "text-slate-500"}`}
        >
          依存:{" "}
          {item.dependencies
            .map((dep) => (dep.status === TASK_STATUS.DONE ? dep.title : `${dep.title}*`))
            .join(", ")}
        </p>
      )}

      {/* Kanban-specific severity display */}
      {isKanban && showSeverity && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <span className="border border-slate-200 bg-white px-2 py-1">緊急度: {item.urgency}</span>
          <span className="border border-slate-200 bg-white px-2 py-1">リスク: {item.risk}</span>
          {item.dueDate && (
            <span className="border border-slate-200 bg-white px-2 py-1">
              期限: {new Date(item.dueDate).toLocaleDateString()}
            </span>
          )}
          {item.assigneeId && (
            <span className="border border-slate-200 bg-white px-2 py-1">
              担当: {members.find((m) => m.id === item.assigneeId)?.name ?? "未設定"}
            </span>
          )}
          {item.tags && item.tags.length > 0 && (
            <span className="border border-slate-200 bg-white px-2 py-1">
              #{item.tags.join(" #")}
            </span>
          )}
        </div>
      )}

      {/* Action buttons */}
      {!isKanban && (
        <div className="mt-2 flex items-center gap-2 text-xs">
          {/* Custom actions */}
          {renderActions?.()}

          {/* Default actions based on variant */}
          {!renderActions && (
            <>
              {variant === "backlog" && onMoveToSprint && (
                <button
                  className="border border-slate-200 bg-white px-3 py-1 text-slate-700 transition hover:border-[#2323eb]/50 hover:text-[#2323eb]"
                  onClick={() => {
                    if (isBlocked) {
                      toast.warning("依存タスクが未完了のため移動できません。");
                      return;
                    }
                    onMoveToSprint();
                  }}
                >
                  スプリントに送る
                </button>
              )}

              {variant === "backlog" && onMoveToBacklog && (
                <button
                  className="border border-slate-200 bg-white px-3 py-1 text-slate-700 transition hover:border-[#2323eb]/50 hover:text-[#2323eb]"
                  onClick={onMoveToBacklog}
                >
                  目標リストに戻す
                </button>
              )}

              {variant === "sprint" && onMarkDone && (
                <button
                  className="border border-slate-200 bg-white px-3 py-1 text-slate-700 transition hover:border-[#2323eb]/50 hover:text-[#2323eb]"
                  onClick={onMarkDone}
                >
                  完了
                </button>
              )}

              {/* AI Suggestions Dropdown */}
              {aiConfig && (
                <DropdownMenu
                  label="AI提案"
                  items={[
                    {
                      label: "ヒントを見る",
                      onClick: aiConfig.onGetSuggestion,
                      loading: aiConfig.suggestLoadingId === item.id,
                    },
                    {
                      label: "スコア推定",
                      onClick: aiConfig.onEstimateScore,
                      loading: aiConfig.scoreLoadingId === item.id,
                    },
                    {
                      label: "分解提案",
                      onClick: aiConfig.onRequestSplit,
                      loading: aiConfig.splitLoadingId === item.id,
                      disabled: item.points <= aiConfig.splitThreshold,
                    },
                    ...(aiConfig.onOpenPrepModal
                      ? [{ label: "下準備", onClick: aiConfig.onOpenPrepModal }]
                      : []),
                  ]}
                />
              )}

              {onEdit && (
                <button
                  className="border border-slate-200 bg-white p-1 text-slate-700 transition hover:border-[#2323eb]/50 hover:text-[#2323eb]"
                  onClick={onEdit}
                  aria-label="編集"
                >
                  <Pencil size={14} />
                </button>
              )}

              {onDelete && (
                <button
                  className="border border-slate-200 bg-white p-1 text-slate-700 transition hover:border-red-300 hover:text-red-600"
                  onClick={onDelete}
                  aria-label="削除"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* AI Tip Suggestion */}
      {aiConfig?.suggestion && (
        <div className="mt-2 border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
          <p>{aiConfig.suggestion.text}</p>
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={aiConfig.onApplyTipSuggestion}
              className="border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 transition hover:border-emerald-300"
            >
              適用
            </button>
            <button
              onClick={aiConfig.onDismissTip}
              className="border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-500 transition hover:border-slate-300"
            >
              閉じる
            </button>
          </div>
        </div>
      )}

      {/* AI Score Suggestion */}
      {aiConfig?.score && (
        <div className="mt-2 border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Score suggestion</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
            <span className="border border-slate-200 bg-slate-50 px-2 py-1">
              {aiConfig.score.points} pt
            </span>
            <span className="border border-slate-200 bg-slate-50 px-2 py-1">
              緊急度:{" "}
              {SEVERITY_LABELS[aiConfig.score.urgency as Severity] ?? aiConfig.score.urgency}
            </span>
            <span className="border border-slate-200 bg-slate-50 px-2 py-1">
              リスク: {SEVERITY_LABELS[aiConfig.score.risk as Severity] ?? aiConfig.score.risk}
            </span>
          </div>
          {aiConfig.score.reason && (
            <p className="mt-2 text-[11px] text-slate-500">{aiConfig.score.reason}</p>
          )}
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={aiConfig.onApplyScoreSuggestion}
              className="border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 transition hover:border-emerald-300"
            >
              適用
            </button>
            <button
              onClick={aiConfig.onDismissScore}
              className="border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-500 transition hover:border-slate-300"
            >
              閉じる
            </button>
          </div>
        </div>
      )}

      {/* Metadata */}
      {showMetadata && !isKanban && !isCompact && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
          {item.parentId && parentTask && (
            <span className="border border-slate-200 bg-white px-2 py-1">
              親: {parentTask.title}
            </span>
          )}
          {childCount > 0 && (
            <span className="border border-slate-200 bg-white px-2 py-1">子: {childCount} 件</span>
          )}
          {item.dueDate && (
            <span className="border border-slate-200 bg-white px-2 py-1">
              期限: {new Date(item.dueDate).toLocaleDateString()}
            </span>
          )}
          {item.assigneeId && (
            <span className="border border-slate-200 bg-white px-2 py-1">
              担当: {members.find((m) => m.id === item.assigneeId)?.name ?? "未設定"}
            </span>
          )}
          {item.tags && item.tags.length > 0 && (
            <span className="border border-slate-200 bg-white px-2 py-1">
              #{item.tags.join(" #")}
            </span>
          )}
          {item.type === TASK_TYPE.ROUTINE && item.routineCadence && (
            <span className="border border-slate-200 bg-white px-2 py-1">
              ルーティン: {item.routineCadence === "DAILY" ? "毎日" : "毎週"}
            </span>
          )}
          {item.dependencies && item.dependencies.length > 0 && (
            <span
              className={`border px-2 py-1 ${
                isBlocked
                  ? "border-amber-200 bg-amber-50 text-amber-700"
                  : "border-slate-200 bg-white"
              }`}
            >
              依存:{" "}
              {item.dependencies
                .map((dep) => (dep.status === TASK_STATUS.DONE ? dep.title : `${dep.title}*`))
                .join(", ")}
            </span>
          )}
        </div>
      )}

      {/* Sprint variant metadata (inline) */}
      {variant === "sprint" && !isCompact && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
          {item.type === TASK_TYPE.ROUTINE && item.routineCadence && (
            <span className="border border-slate-200 bg-white px-2 py-1">
              {item.routineCadence === "DAILY" ? "毎日" : "毎週"}
            </span>
          )}
          {item.dueDate && (
            <span className="border border-slate-200 bg-white px-2 py-1">
              期限 {new Date(item.dueDate).toLocaleDateString()}
            </span>
          )}
          {item.assigneeId && (
            <span className="border border-slate-200 bg-white px-2 py-1">
              {members.find((m) => m.id === item.assigneeId)?.name ?? "担当"}
            </span>
          )}
        </div>
      )}

      {/* Split Suggestions */}
      {aiConfig?.splits && aiConfig.splits.length > 0 && (
        <div className="mt-3 border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Split suggestions</p>
          <div className="mt-2 grid gap-2">
            {aiConfig.splits.map((split, idx) => (
              <div key={`${item.id}-${idx}`} className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">{split.title}</p>
                  <p className="text-[11px] text-slate-600">{split.detail}</p>
                </div>
                <span className="border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-700">
                  {split.points} pt
                </span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={aiConfig.onApplySplit}
              className="border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] text-slate-700 transition hover:border-[#2323eb]/60 hover:text-[#2323eb]"
            >
              この分解をバックログに追加
            </button>
            <button
              onClick={aiConfig.onDismissSplit}
              className="border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-500 transition hover:border-slate-300"
            >
              閉じる
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
