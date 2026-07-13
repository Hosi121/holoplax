"use client";

import { Chrome, Github, KeyRound } from "lucide-react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";
import { type ReactNode, Suspense, useEffect, useRef } from "react";
import { useToast } from "../components/toast";
import { ConfirmDialog } from "../components/ui/confirm-dialog";
import { Modal } from "../components/ui/dialog";
import { useWorkspaceId } from "../components/use-workspace-id";
import { useAccount } from "./hooks/use-account";
import { useMcpKeys } from "./hooks/use-mcp-keys";
import {
  formatClaimValue,
  type MemoryClaimRow,
  type MemoryDefinitionRow,
  useMemory,
} from "./hooks/use-memory";
import { formatQuestionValue, useMemoryQuestions } from "./hooks/use-memory-questions";
import { useThresholds } from "./hooks/use-thresholds";

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsContent />
    </Suspense>
  );
}

function SettingsContent() {
  const { update } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { workspaceId, ready } = useWorkspaceId();
  const toast = useToast();
  const errorHandled = useRef(false);

  useEffect(() => {
    const error = searchParams.get("error");
    if (error && !errorHandled.current) {
      errorHandled.current = true;
      if (error === "OAuthAccountNotLinked") {
        toast.error("このメールアドレスは既に別のユーザーに登録されています。");
      } else {
        toast.error(`連携に失敗しました: ${error}`);
      }
      router.replace("/settings");
    }
  }, [searchParams, router, toast]);

  const {
    account,
    accountDirty,
    linkedProviders,
    unlinking,
    fetchAccount,
    updateAccountField,
    saveAccount,
    uploadAvatar,
    unlinkProvider,
  } = useAccount({
    onSessionUpdate: async (user) => {
      await update({ user });
    },
    onRouterRefresh: () => router.refresh(),
    onError: toast.error,
    onSuccess: toast.success,
  });

  const { low, high, dirty, fetchThresholds, updateLow, updateHigh, saveThresholds } =
    useThresholds({ ready, workspaceId, onError: toast.error });
  const {
    keys: mcpKeys,
    name: mcpKeyName,
    setName: setMcpKeyName,
    fullKey: newMcpKey,
    setFullKey: setNewMcpKey,
    loading: mcpKeyLoading,
    fetchKeys: fetchMcpKeys,
    createKey: createMcpKey,
    revokeKey: revokeMcpKey,
  } = useMcpKeys({
    ready,
    workspaceId,
    onError: toast.error,
    onSuccess: toast.success,
  });

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
    void fetchThresholds();
    void fetchAccount();
    void fetchMemory();
    void fetchMemoryQuestions();
    void fetchMcpKeys();
  }, [fetchThresholds, fetchAccount, fetchMemory, fetchMemoryQuestions, fetchMcpKeys]);

  const handleSaveThresholds = async () => {
    if (await saveThresholds()) {
      toast.success("AI自動化の境界値を保存しました。");
    } else {
      toast.error("AI自動化の境界値を保存できませんでした。");
    }
  };

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
          onChange={(e) => handleMemoryDraftChange(type.id, e.target.value)}
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
          onChange={(e) => handleMemoryDraftChange(type.id, e.target.value)}
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
        onChange={(e) => handleMemoryDraftChange(type.id, e.target.value)}
        className="w-full border border-slate-200 px-3 py-2 text-xs text-slate-800 outline-none focus:border-[#2323eb]"
        placeholder={type.unit ? `unit: ${type.unit}` : "値を入力"}
        step={stepValue}
      />
    );
  };

  const MemoryCard = ({
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
  }: {
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
  }) => (
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

  return (
    <main className="max-w-6xl flex-1 space-y-6 px-4 py-10 lg:ml-60 lg:px-6 lg:py-14">
      <header className="border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-xs uppercase text-slate-500">Settings</p>
            <h1 className="text-3xl font-semibold text-slate-900">設定</h1>
            <p className="text-sm text-slate-600">
              アカウント、AI自動化、AIが覚えている情報を管理します。
            </p>
          </div>
        </div>
      </header>

      <section className="grid gap-4 lg:grid-cols-2">
        <div id="account" className="border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900">アカウント</h3>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1 text-xs text-slate-500">
              名前
              <input
                value={account.name}
                onChange={(e) => updateAccountField("name", e.target.value)}
                className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
                placeholder="名前"
              />
            </label>
            <label className="grid gap-1 text-xs text-slate-500">
              メール
              <input
                value={account.email}
                onChange={(e) => updateAccountField("email", e.target.value)}
                className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
                placeholder="you@example.com"
              />
            </label>
          </div>
          <div className="mt-4 flex items-center gap-4">
            <div className="size-12 border border-slate-200 bg-slate-100">
              {account.image ? (
                <Image
                  src={account.image}
                  alt="avatar"
                  width={48}
                  height={48}
                  unoptimized
                  className="h-full w-full object-cover"
                />
              ) : null}
            </div>
            <label className="text-xs text-slate-500">
              アイコン画像
              <input
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  await uploadAvatar(file);
                }}
                className="mt-2 block text-xs text-slate-600 file:mr-3 file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-slate-700"
              />
            </label>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={saveAccount}
              disabled={!accountDirty}
              className="border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700 transition hover:border-[#2323eb]/60 hover:text-[#2323eb] disabled:opacity-50"
            >
              変更を保存
            </button>
            <button
              onClick={() => signOut()}
              className="border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 transition hover:border-red-300 hover:text-red-600"
            >
              ログアウト
            </button>
          </div>
        </div>

        <div className="border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
          <h3 className="text-lg font-semibold text-slate-900">外部アカウント連携</h3>
          <p className="text-sm text-slate-600">
            Google・GitHubアカウントと連携してログインできるようにします。
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="flex items-center justify-between border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex items-center gap-3">
                <Chrome size={20} className="text-slate-600" />
                <div>
                  <p className="text-sm font-medium text-slate-900">Google</p>
                  <p className="text-xs text-slate-500">
                    {linkedProviders.includes("google") ? "連携済み" : "未連携"}
                  </p>
                </div>
              </div>
              {linkedProviders.includes("google") ? (
                <ConfirmDialog
                  title="Googleとの連携を解除しますか？"
                  description="別のログイン方法を利用できることを確認してから解除してください。"
                  confirmLabel="連携を解除"
                  onConfirm={() => unlinkProvider("google")}
                  trigger={
                    <button
                      type="button"
                      disabled={unlinking === "google"}
                      className="border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 hover:border-red-300 hover:text-red-600 disabled:opacity-50"
                    >
                      {unlinking === "google" ? "解除中..." : "連携解除"}
                    </button>
                  }
                />
              ) : (
                <button
                  onClick={() => signIn("google", { callbackUrl: "/settings" })}
                  className="border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 transition hover:border-[#2323eb]/60 hover:text-[#2323eb]"
                >
                  連携する
                </button>
              )}
            </div>
            <div className="flex items-center justify-between border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex items-center gap-3">
                <Github size={20} className="text-slate-600" />
                <div>
                  <p className="text-sm font-medium text-slate-900">GitHub</p>
                  <p className="text-xs text-slate-500">
                    {linkedProviders.includes("github") ? "連携済み" : "未連携"}
                  </p>
                </div>
              </div>
              {linkedProviders.includes("github") ? (
                <ConfirmDialog
                  title="GitHubとの連携を解除しますか？"
                  description="別のログイン方法を利用できることを確認してから解除してください。"
                  confirmLabel="連携を解除"
                  onConfirm={() => unlinkProvider("github")}
                  trigger={
                    <button
                      type="button"
                      disabled={unlinking === "github"}
                      className="border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 hover:border-red-300 hover:text-red-600 disabled:opacity-50"
                    >
                      {unlinking === "github" ? "解除中..." : "連携解除"}
                    </button>
                  }
                />
              ) : (
                <button
                  onClick={() => signIn("github", { callbackUrl: "/settings" })}
                  className="border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 transition hover:border-[#2323eb]/60 hover:text-[#2323eb]"
                >
                  連携する
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
          <div className="flex items-start gap-3">
            <KeyRound size={20} className="mt-0.5 text-slate-500" />
            <div>
              <h3 className="text-lg font-semibold text-slate-900">MCP接続キー</h3>
              <p className="text-sm text-slate-600">
                CodexやClaudeなどから、このワークスペースを安全に操作するためのキーです。
              </p>
            </div>
          </div>
          {newMcpKey ? (
            <div className="mt-4 border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs font-semibold text-amber-900">このキーは一度だけ表示されます</p>
              <code className="mt-2 block break-all bg-white p-3 text-xs text-slate-800">
                {newMcpKey}
              </code>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(newMcpKey);
                    toast.success("キーをコピーしました。");
                  }}
                  className="border border-amber-300 bg-white px-3 py-1 text-xs text-amber-900"
                >
                  コピー
                </button>
                <button
                  type="button"
                  onClick={() => setNewMcpKey(null)}
                  className="border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700"
                >
                  閉じる
                </button>
              </div>
            </div>
          ) : null}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <input
              value={mcpKeyName}
              onChange={(event) => setMcpKeyName(event.target.value)}
              maxLength={100}
              aria-label="接続キーの名前"
              className="min-w-0 flex-1 border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
              placeholder="例: 自宅のCodex"
            />
            <button
              type="button"
              disabled={!workspaceId || !mcpKeyName.trim() || mcpKeyLoading}
              onClick={() => void createMcpKey()}
              className="bg-[#2323eb] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {mcpKeyLoading ? "作成中..." : "接続キーを作成"}
            </button>
          </div>
          <div className="mt-4 grid gap-2">
            {mcpKeys.length ? (
              mcpKeys.map((key) => (
                <div
                  key={key.id}
                  className="flex flex-col justify-between gap-3 border border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{key.name}</p>
                    <p className="text-xs text-slate-500">
                      {key.keyPrefix} ・ {key.workspace.name} ・ 最終利用{" "}
                      {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString("ja-JP") : "未使用"}
                    </p>
                  </div>
                  <ConfirmDialog
                    title={`${key.name} を無効にしますか？`}
                    description="このキーを使っているMCPクライアントは接続できなくなります。"
                    confirmLabel="無効にする"
                    onConfirm={() => revokeMcpKey(key.id)}
                    trigger={
                      <button
                        type="button"
                        className="border border-rose-200 bg-white px-3 py-1 text-xs text-rose-700"
                      >
                        無効にする
                      </button>
                    }
                  />
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-500">有効な接続キーはありません。</p>
            )}
          </div>
        </div>

        <div className="border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">AI自動化の境界値</h3>
          <p className="text-sm text-slate-600">
            AIに任せる範囲と、分割を提案する範囲を設定します（現在: {low} / {high}）。
          </p>
          <div className="mt-3 flex items-center gap-2 text-sm">
            <input
              type="number"
              value={low}
              onChange={(e) => updateLow(Number(e.target.value) || 0)}
              className="w-20 border border-slate-200 px-3 py-2 text-slate-800 outline-none focus:border-[#2323eb]"
            />
            <input
              type="number"
              value={high}
              onChange={(e) => updateHigh(Number(e.target.value) || 0)}
              className="w-20 border border-slate-200 px-3 py-2 text-slate-800 outline-none focus:border-[#2323eb]"
            />
            <button
              onClick={() => void handleSaveThresholds()}
              disabled={!dirty}
              className="border border-slate-200 bg-slate-50 px-4 py-2 text-slate-700 transition hover:border-[#2323eb]/60 hover:text-[#2323eb] disabled:opacity-50"
            >
              保存
            </button>
          </div>
        </div>

        <div className="border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">AIが覚えている情報</h3>
              <p className="text-sm text-slate-600">
                AIの提案で考慮してほしい前提情報を管理します。
              </p>
            </div>
            {memoryLoading || memoryQuestionLoading ? (
              <span className="text-xs text-slate-500">読み込み中...</span>
            ) : null}
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="grid gap-3">
              <p className="text-xs font-semibold uppercase text-slate-400">自分について</p>
              {userMemoryDefinitions.length ? (
                userMemoryDefinitions.map((type) => (
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
                <p className="text-xs text-slate-500">自分について保存した情報はありません。</p>
              )}
            </div>
            <div className="grid gap-3">
              <p className="text-xs font-semibold uppercase text-slate-400">
                ワークスペースについて
              </p>
              {workspaceId ? (
                workspaceMemoryDefinitions.length ? (
                  workspaceMemoryDefinitions.map((type) => (
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
                  <p className="text-xs text-slate-500">
                    ワークスペースについて保存した情報はありません。
                  </p>
                )
              ) : (
                <p className="text-xs text-slate-500">ワークスペースを選択すると表示されます。</p>
              )}
            </div>
          </div>
        </div>
      </section>

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
    </main>
  );
}
