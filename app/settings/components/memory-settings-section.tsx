"use client";

import { type ReactNode, useEffect } from "react";
import { useToast } from "../../components/toast";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { Modal } from "../../components/ui/dialog";
import {
  formatClaimValue,
  type MemoryClaimRow,
  type MemoryDefinitionRow,
  useMemory,
} from "../hooks/use-memory";
import { formatQuestionValue, useMemoryQuestions } from "../hooks/use-memory-questions";

type MemorySettingsSectionProps = {
  ready: boolean;
  workspaceId: string | null;
};

type MemoryCardProps = {
  type: MemoryDefinitionRow;
  claim?: MemoryClaimRow;
  isEditing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onRemove: () => void;
  saving: boolean;
  removing?: boolean;
  renderInput: () => ReactNode;
};

function MemoryCard({
  type,
  claim,
  isEditing,
  onEdit,
  onCancel,
  onSave,
  onRemove,
  saving,
  removing,
  renderInput,
}: MemoryCardProps) {
  return (
    <div className="border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">{type.key}</p>
          {type.description ? <p className="text-xs text-slate-500">{type.description}</p> : null}
        </div>
        <div className="flex gap-2 text-xs">
          {isEditing ? (
            <>
              <ConfirmDialog
                title="この情報を削除しますか？"
                description={`「${type.key}」に保存した情報を削除します。`}
                confirmLabel="削除する"
                onConfirm={onRemove}
                trigger={
                  <button
                    type="button"
                    disabled={Boolean(removing)}
                    className="border border-rose-200 bg-rose-50 px-3 py-1 text-[11px] text-rose-700 hover:border-rose-300 disabled:opacity-50"
                  >
                    削除
                  </button>
                }
              />
              <button
                onClick={onSave}
                disabled={saving}
                className="border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] text-slate-700 transition hover:border-[#2323eb]/60 hover:text-[#2323eb] disabled:opacity-50"
              >
                保存
              </button>
              <button
                onClick={onCancel}
                className="border border-slate-200 bg-white px-3 py-1 text-[11px] text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
              >
                キャンセル
              </button>
            </>
          ) : (
            <button
              onClick={onEdit}
              className="border border-slate-200 bg-white px-3 py-1 text-[11px] text-slate-700 transition hover:border-[#2323eb]/60 hover:text-[#2323eb]"
            >
              編集
            </button>
          )}
        </div>
      </div>
      <div className="mt-2 text-xs text-slate-600">
        現在値: {formatClaimValue(type, claim) || "未設定"}
      </div>
      {isEditing ? <div className="mt-3">{renderInput()}</div> : null}
    </div>
  );
}

export function MemorySettingsSection({ ready, workspaceId }: MemorySettingsSectionProps) {
  const toast = useToast();
  const {
    memoryClaims,
    memoryDrafts,
    memoryLoading,
    memorySavingId,
    memoryRemovingId,
    editingMemoryId,
    userMemoryDefinitions,
    workspaceMemoryDefinitions,
    fetchMemory,
    handleMemoryDraftChange,
    saveMemory,
    removeMemory,
    setEditingMemoryId,
    cancelEdit,
  } = useMemory({
    ready,
    workspaceId,
    onWarning: toast.warning,
    onError: toast.error,
    onSuccess: toast.success,
  });
  const {
    memoryQuestionLoading,
    memoryQuestionActionId,
    activeQuestion,
    fetchMemoryQuestions,
    respondMemoryQuestion,
  } = useMemoryQuestions({
    ready,
    onAccept: () => void fetchMemory(),
    onError: toast.error,
  });

  useEffect(() => {
    void fetchMemory();
    void fetchMemoryQuestions();
  }, [fetchMemory, fetchMemoryQuestions]);

  const renderMemoryInput = (type: MemoryDefinitionRow) => {
    const value = memoryDrafts[type.id] ?? "";
    if (
      type.valueType === "JSON" ||
      type.valueType === "HISTOGRAM_24x7" ||
      type.valueType === "RATIO_BY_TYPE"
    ) {
      return (
        <textarea
          value={value}
          onChange={(event) => handleMemoryDraftChange(type.id, event.target.value)}
          rows={3}
          className="w-full border border-slate-200 px-3 py-2 text-xs text-slate-800 outline-none focus:border-[#2323eb]"
          placeholder="JSONで入力"
        />
      );
    }
    if (type.valueType === "BOOL") {
      return (
        <select
          value={value}
          onChange={(event) => handleMemoryDraftChange(type.id, event.target.value)}
          className="w-full border border-slate-200 px-3 py-2 text-xs text-slate-800 outline-none focus:border-[#2323eb]"
        >
          <option value="">未設定</option>
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      );
    }
    const inputType =
      type.valueType === "NUMBER" || type.valueType === "RATIO" || type.valueType === "DURATION_MS"
        ? "number"
        : "text";
    const stepValue =
      inputType === "number" ? (type.valueType === "RATIO" ? "0.01" : "1") : undefined;
    return (
      <input
        type={inputType}
        value={value}
        onChange={(event) => handleMemoryDraftChange(type.id, event.target.value)}
        className="w-full border border-slate-200 px-3 py-2 text-xs text-slate-800 outline-none focus:border-[#2323eb]"
        placeholder={type.unit ? `unit: ${type.unit}` : "値を入力"}
        step={stepValue}
      />
    );
  };

  const renderCards = (definitions: MemoryDefinitionRow[], emptyMessage: string) =>
    definitions.length ? (
      definitions.map((type) => (
        <MemoryCard
          key={type.id}
          type={type}
          claim={memoryClaims[type.id]}
          isEditing={editingMemoryId === type.id}
          onEdit={() => setEditingMemoryId(type.id)}
          onCancel={() => cancelEdit(type.id)}
          onSave={() => saveMemory(type).then(() => setEditingMemoryId(null))}
          onRemove={() => removeMemory(type)}
          saving={memorySavingId === type.id}
          removing={memoryRemovingId === memoryClaims[type.id]?.id}
          renderInput={() => renderMemoryInput(type)}
        />
      ))
    ) : (
      <p className="text-xs text-slate-500">{emptyMessage}</p>
    );

  return (
    <>
      <div className="border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">AIが覚えている情報</h3>
            <p className="text-sm text-slate-600">AIの提案で考慮してほしい前提情報を管理します。</p>
          </div>
          {memoryLoading || memoryQuestionLoading ? (
            <span className="text-xs text-slate-500">読み込み中...</span>
          ) : null}
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="grid gap-3">
            <p className="text-xs font-semibold uppercase text-slate-400">自分について</p>
            {renderCards(userMemoryDefinitions, "自分について保存した情報はありません。")}
          </div>
          <div className="grid gap-3">
            <p className="text-xs font-semibold uppercase text-slate-400">ワークスペースについて</p>
            {workspaceId ? (
              renderCards(
                workspaceMemoryDefinitions,
                "ワークスペースについて保存した情報はありません。",
              )
            ) : (
              <p className="text-xs text-slate-500">ワークスペースを選択すると表示されます。</p>
            )}
          </div>
        </div>
      </div>

      {activeQuestion ? (
        <Modal
          open={Boolean(activeQuestion)}
          onOpenChange={(open) => {
            if (!open) void respondMemoryQuestion(activeQuestion, "hold");
          }}
          title={activeQuestion.definition.key}
          description={
            activeQuestion.definition.description ?? "AIが推測した情報を確認してください。"
          }
        >
          <div className="flex items-start justify-between gap-4">
            <p className="text-sm text-slate-600">AIが覚える候補</p>
            <span className="border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-700">
              信頼度 {Math.round(activeQuestion.confidence * 100)}%
            </span>
          </div>
          <div className="mt-4 border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
            <p className="text-[11px] text-slate-500">候補の内容</p>
            <pre className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
              {formatQuestionValue(activeQuestion) || "値が未設定です"}
            </pre>
          </div>
          <p className="mt-3 text-xs text-slate-500">この内容をAIが覚えてよいですか？</p>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            <button
              onClick={() => respondMemoryQuestion(activeQuestion, "accept")}
              disabled={memoryQuestionActionId === activeQuestion.id}
              className="border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700 transition hover:border-emerald-300 disabled:opacity-50"
            >
              採用
            </button>
            <button
              onClick={() => respondMemoryQuestion(activeQuestion, "reject")}
              disabled={memoryQuestionActionId === activeQuestion.id}
              className="border border-rose-200 bg-rose-50 px-3 py-1 text-rose-700 transition hover:border-rose-300 disabled:opacity-50"
            >
              却下
            </button>
            <button
              onClick={() => respondMemoryQuestion(activeQuestion, "hold")}
              disabled={memoryQuestionActionId === activeQuestion.id}
              className="border border-slate-200 bg-white px-3 py-1 text-slate-700 transition hover:border-[#2323eb]/60 hover:text-[#2323eb] disabled:opacity-50"
            >
              保留して閉じる
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
