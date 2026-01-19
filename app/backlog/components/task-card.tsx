"use client";

import { Pencil, Trash2 } from "lucide-react";
import { LoadingButton } from "../../components/loading-button";
import {
  TASK_STATUS,
  TASK_TYPE,
  AUTOMATION_STATE,
  TaskDTO,
  TaskType,
} from "../../../lib/types";

const taskTypeLabels: Record<TaskType, string> = {
  [TASK_TYPE.EPIC]: "目標",
  [TASK_TYPE.PBI]: "PBI",
  [TASK_TYPE.TASK]: "タスク",
  [TASK_TYPE.ROUTINE]: "ルーティン",
};

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

export type TaskCardProps = {
  item: TaskDTO;
  view: "product" | "sprint";
  splitThreshold: number;
  // Loading states
  suggestLoadingId: string | null;
  scoreLoadingId: string | null;
  splitLoadingId: string | null;
  // Suggestions
  suggestion?: TipResult;
  score?: ScoreResult;
  splits?: SplitSuggestion[];
  // Helpers
  isBlocked: (item: TaskDTO) => boolean;
  childCount: number;
  // Actions
  onMoveToSprint: (id: string) => void;
  onMoveToBacklog: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (item: TaskDTO) => void;
  onOpenPrepModal: (item: TaskDTO) => void;
  onGetSuggestion: (title: string, description?: string, taskId?: string) => void;
  onEstimateScore: (item: TaskDTO) => void;
  onRequestSplit: (item: TaskDTO) => void;
  onApplySplit: (item: TaskDTO) => void;
  onApplyTipSuggestion: (itemId: string) => void;
  onApplyScoreSuggestion: (itemId: string) => void;
  onToggleChecklistItem: (taskId: string, checklistId: string) => void;
};

export function TaskCard({
  item,
  view,
  splitThreshold,
  suggestLoadingId,
  scoreLoadingId,
  splitLoadingId,
  suggestion,
  score,
  splits,
  isBlocked,
  childCount,
  onMoveToSprint,
  onMoveToBacklog,
  onDelete,
  onEdit,
  onOpenPrepModal,
  onGetSuggestion,
  onEstimateScore,
  onRequestSplit,
  onApplySplit,
  onApplyTipSuggestion,
  onApplyScoreSuggestion,
  onToggleChecklistItem,
}: TaskCardProps) {
  return (
    <div className="border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-slate-900">{item.title}</p>
        <div className="flex items-center gap-2 text-xs">
          <span className="border border-slate-200 bg-white px-2 py-1 text-slate-600">
            {taskTypeLabels[(item.type ?? TASK_TYPE.PBI) as TaskType]}
          </span>
          <span className="border border-slate-200 bg-white px-2 py-1 text-slate-700">
            {item.points} pt
          </span>
          <span className="border border-slate-200 bg-white px-2 py-1 text-slate-700">
            緊急度: {item.urgency}
          </span>
          <span className="border border-slate-200 bg-white px-2 py-1 text-slate-700">
            リスク: {item.risk}
          </span>
          {item.automationState === AUTOMATION_STATE.PENDING_SPLIT ? (
            <span className="border border-amber-200 bg-amber-50 px-2 py-1 text-amber-700">
              承認待ち
            </span>
          ) : null}
        </div>
      </div>

      {item.description ? (
        <p className="mt-1 text-sm text-slate-700">{item.description}</p>
      ) : null}

      {item.definitionOfDone ? (
        <p className="mt-1 text-xs text-slate-500">
          完了条件: {item.definitionOfDone}
        </p>
      ) : null}

      {item.checklist && item.checklist.length > 0 ? (
        <div className="mt-2 grid gap-1 text-xs text-slate-600">
          {item.checklist.map((check) => (
            <label key={check.id} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={check.done}
                onChange={() => onToggleChecklistItem(item.id, check.id)}
                className="accent-[#2323eb]"
              />
              <span
                className={
                  check.done ? "line-through text-slate-400" : "text-slate-600"
                }
              >
                {check.text}
              </span>
            </label>
          ))}
        </div>
      ) : null}

      {/* Child count indicator */}
      {childCount > 0 ? (
        <p className="mt-1 text-xs text-slate-500">
          子タスク: {childCount} 件
        </p>
      ) : null}

      {/* Action buttons */}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        {view === "product" ? (
          <button
            className="border border-slate-200 bg-white px-3 py-1 text-slate-700 transition hover:border-[#2323eb]/50 hover:text-[#2323eb]"
            onClick={() => {
              if (isBlocked(item)) {
                window.alert("依存タスクが未完了のため移動できません。");
                return;
              }
              onMoveToSprint(item.id);
            }}
          >
            スプリントに送る
          </button>
        ) : (
          <button
            className="border border-slate-200 bg-white px-3 py-1 text-slate-700 transition hover:border-[#2323eb]/50 hover:text-[#2323eb]"
            onClick={() => onMoveToBacklog(item.id)}
          >
            目標リストに戻す
          </button>
        )}

        <LoadingButton
          className="border border-slate-200 bg-white px-3 py-1 text-slate-700 transition hover:border-[#2323eb]/50 hover:text-[#2323eb]"
          onClick={() => onGetSuggestion(item.title, item.description, item.id)}
          loading={suggestLoadingId === item.id}
        >
          AI 提案を見る
        </LoadingButton>

        <LoadingButton
          className="border border-slate-200 bg-white px-3 py-1 text-slate-700 transition hover:border-[#2323eb]/50 hover:text-[#2323eb]"
          onClick={() => onEstimateScore(item)}
          loading={scoreLoadingId === item.id}
        >
          AIでスコア推定
        </LoadingButton>

        <button
          className="border border-slate-200 bg-white px-3 py-1 text-slate-700 transition hover:border-[#2323eb]/50 hover:text-[#2323eb]"
          onClick={() => onOpenPrepModal(item)}
        >
          AIで下準備
        </button>

        <button
          className="border border-slate-200 bg-white p-1 text-slate-700 transition hover:border-[#2323eb]/50 hover:text-[#2323eb]"
          onClick={() => onEdit(item)}
          aria-label="編集"
        >
          <Pencil size={14} />
        </button>

        <button
          className="border border-slate-200 bg-white p-1 text-slate-700 transition hover:border-red-300 hover:text-red-600"
          onClick={() => onDelete(item.id)}
          aria-label="削除"
        >
          <Trash2 size={14} />
        </button>

        {item.points > splitThreshold ? (
          <LoadingButton
            className="border border-slate-200 bg-white px-3 py-1 text-slate-700 transition hover:border-[#2323eb]/50 hover:text-[#2323eb]"
            onClick={() => onRequestSplit(item)}
            loading={splitLoadingId === item.id}
          >
            分解提案
          </LoadingButton>
        ) : null}
      </div>

      {/* AI Tip Suggestion */}
      {suggestion ? (
        <div className="mt-2 border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
          <p>{suggestion.text}</p>
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={() => onApplyTipSuggestion(item.id)}
              className="border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 transition hover:border-emerald-300"
            >
              適用
            </button>
          </div>
        </div>
      ) : null}

      {/* AI Score Suggestion */}
      {score ? (
        <div className="mt-2 border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
            Score suggestion
          </p>
          <div className="mt-1 flex items-center gap-2 text-slate-800">
            <span className="border border-slate-200 px-2 py-1">
              {score.points} pt
            </span>
            <span className="border border-slate-200 px-2 py-1">
              緊急度: {score.urgency}
            </span>
            <span className="border border-slate-200 px-2 py-1">
              リスク: {score.risk}
            </span>
          </div>
          {score.reason ? (
            <p className="mt-1 text-slate-600">{score.reason}</p>
          ) : null}
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={() => onApplyScoreSuggestion(item.id)}
              className="border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 transition hover:border-emerald-300"
            >
              このスコアを適用
            </button>
          </div>
        </div>
      ) : null}

      {/* Split Suggestions */}
      {splits && splits.length > 0 ? (
        <div className="mt-2 border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
          <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
            分解提案
          </p>
          <div className="mt-1 grid gap-2">
            {splits.map((split, idx) => (
              <div key={idx} className="border border-slate-100 p-2">
                <p className="font-semibold text-slate-900">{split.title}</p>
                <div className="mt-1 flex items-center gap-2 text-[11px]">
                  <span className="border border-slate-200 px-1 py-0.5">
                    {split.points} pt
                  </span>
                  <span className="border border-slate-200 px-1 py-0.5">
                    緊急度: {split.urgency}
                  </span>
                  <span className="border border-slate-200 px-1 py-0.5">
                    リスク: {split.risk}
                  </span>
                </div>
                {split.detail ? (
                  <p className="mt-1 text-slate-600">{split.detail}</p>
                ) : null}
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={() => onApplySplit(item)}
              className="border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 transition hover:border-emerald-300"
            >
              この分解をバックログに追加
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
