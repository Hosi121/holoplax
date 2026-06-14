"use client";

import type { TaskDTO } from "../../../lib/types";
import { LoadingButton } from "../../components/loading-button";
import type { AiPrepOutput, AiPrepType } from "../hooks/use-task-prep";

const prepTypeOptions: { value: AiPrepType; label: string }[] = [
  { value: "CHECKLIST", label: "チェックリスト" },
  { value: "IMPLEMENTATION", label: "実装手順" },
  { value: "EMAIL", label: "メール草案" },
];

const prepTypeLabels: Record<AiPrepType, string> = {
  CHECKLIST: "チェックリスト",
  IMPLEMENTATION: "実装手順",
  EMAIL: "メール草案",
};

const prepStatusMeta: Record<AiPrepOutput["status"], { label: string; className: string }> = {
  PENDING: {
    label: "承認待ち",
    className: "border-amber-200 bg-amber-50 text-amber-700",
  },
  APPROVED: {
    label: "承認済み",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  APPLIED: {
    label: "適用済み",
    className: "border-sky-200 bg-sky-50 text-sky-700",
  },
  REJECTED: {
    label: "却下",
    className: "border-rose-200 bg-rose-50 text-rose-700",
  },
};

export type TaskPrepModalProps = {
  task: TaskDTO;
  prepType: AiPrepType;
  onPrepTypeChange: (type: AiPrepType) => void;
  outputs: AiPrepOutput[];
  generateLoading: boolean;
  fetchLoading: boolean;
  actionLoadingId: string | null;
  onClose: () => void;
  onGenerate: () => void;
  onUpdate: (output: AiPrepOutput, action: string) => void;
};

export function TaskPrepModal({
  task,
  prepType,
  onPrepTypeChange,
  outputs,
  generateLoading,
  fetchLoading,
  actionLoadingId,
  onClose,
  onGenerate,
  onUpdate,
}: TaskPrepModalProps) {
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/30 px-4">
      <div className="w-full max-w-2xl border border-slate-200 bg-white p-6 shadow-lg">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">AI下準備</h3>
            <p className="text-xs text-slate-500">{task.title}</p>
          </div>
          <button
            onClick={onClose}
            className="text-sm text-slate-500 transition hover:text-slate-800"
          >
            閉じる
          </button>
        </div>
        <div className="mt-4 grid gap-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <select
              value={prepType}
              onChange={(e) => onPrepTypeChange(e.target.value as AiPrepType)}
              className="border border-slate-200 px-3 py-2 text-slate-800 outline-none focus:border-[#2323eb]"
            >
              {prepTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <LoadingButton
              className="border border-slate-200 bg-slate-50 px-4 py-2 text-slate-700 transition hover:border-[#2323eb]/60 hover:text-[#2323eb]"
              onClick={onGenerate}
              loading={generateLoading}
            >
              生成
            </LoadingButton>
            {fetchLoading ? <span className="text-xs text-slate-500">読み込み中...</span> : null}
          </div>
          {outputs.length ? (
            <div className="grid gap-3">
              {outputs.map((output) => (
                <div
                  key={output.id}
                  className="border border-slate-200 bg-white px-3 py-3 text-xs text-slate-700"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                      {prepTypeLabels[output.type]}
                    </span>
                    <span
                      className={`border px-2 py-1 text-[11px] ${prepStatusMeta[output.status].className}`}
                    >
                      {prepStatusMeta[output.status].label}
                    </span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{output.output}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
                    {output.status === "PENDING" ? (
                      <>
                        <button
                          onClick={() => onUpdate(output, "approve")}
                          disabled={actionLoadingId === `${output.id}-approve`}
                          className="border border-emerald-200 bg-emerald-50 px-2 py-1 font-semibold text-emerald-700 transition hover:border-emerald-300 disabled:opacity-50"
                        >
                          承認
                        </button>
                        <button
                          onClick={() => onUpdate(output, "reject")}
                          disabled={actionLoadingId === `${output.id}-reject`}
                          className="border border-rose-200 bg-rose-50 px-2 py-1 font-semibold text-rose-700 transition hover:border-rose-300 disabled:opacity-50"
                        >
                          却下
                        </button>
                      </>
                    ) : null}
                    {output.status === "APPROVED" ? (
                      <button
                        onClick={() => onUpdate(output, "apply")}
                        disabled={actionLoadingId === `${output.id}-apply`}
                        className="border border-sky-200 bg-sky-50 px-2 py-1 font-semibold text-sky-700 transition hover:border-sky-300 disabled:opacity-50"
                      >
                        適用
                      </button>
                    ) : null}
                    {output.status === "APPLIED" ? (
                      <button
                        onClick={() => onUpdate(output, "revert")}
                        disabled={actionLoadingId === `${output.id}-revert`}
                        className="border border-slate-200 bg-slate-50 px-2 py-1 text-slate-700 transition hover:border-[#2323eb]/60 hover:text-[#2323eb] disabled:opacity-50"
                      >
                        取り消し
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              まだ下準備がありません。タイプを選んで生成してください。
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
