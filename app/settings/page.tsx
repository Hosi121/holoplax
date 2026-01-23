"use client";

import { Chrome, Github } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useWorkspaceId } from "../components/use-workspace-id";
import { useAccount } from "./hooks/use-account";
import {
  formatClaimValue,
  type MemoryClaimRow,
  type MemoryTypeRow,
  useMemory,
} from "./hooks/use-memory";
import { formatQuestionValue, useMemoryQuestions } from "./hooks/use-memory-questions";
import { useThresholds } from "./hooks/use-thresholds";

export default function SettingsPage() {
  const { update } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { workspaceId, ready } = useWorkspaceId();
  const [notifications, setNotifications] = useState(false);
  const errorHandled = useRef(false);

  useEffect(() => {
    const error = searchParams.get("error");
    if (error && !errorHandled.current) {
      errorHandled.current = true;
      if (error === "OAuthAccountNotLinked") {
        window.alert("このメールアドレスは既に別のユーザーに登録されています。");
      } else {
        window.alert(`連携に失敗しました: ${error}`);
      }
      router.replace("/settings");
    }
  }, [searchParams, router]);

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
  });

  const { low, high, dirty, fetchThresholds, updateLow, updateHigh, saveThresholds } =
    useThresholds({ ready, workspaceId });

  const {
    memoryClaims,
    memoryDrafts,
    memoryLoading,
    memorySavingId,
    memoryRemovingId,
    editingMemoryId,
    userMemoryTypes,
    workspaceMemoryTypes,
    fetchMemory,
    handleMemoryDraftChange,
    saveMemory,
    removeMemory,
    setEditingMemoryId,
    cancelEdit,
  } = useMemory({ ready, workspaceId });

  const {
    memoryQuestionLoading,
    memoryQuestionActionId,
    activeQuestion,
    fetchMemoryQuestions,
    respondMemoryQuestion,
  } = useMemoryQuestions({
    ready,
    onAccept: () => void fetchMemory(),
  });

  useEffect(() => {
    void fetchThresholds();
    void fetchAccount();
    void fetchMemory();
    void fetchMemoryQuestions();
  }, [fetchThresholds, fetchAccount, fetchMemory, fetchMemoryQuestions]);

  const renderMemoryInput = (type: MemoryTypeRow) => {
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
    type: MemoryTypeRow;
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
              <button
                onClick={onRemove}
                disabled={Boolean(removing)}
                className="border border-rose-200 bg-rose-50 px-3 py-1 text-[11px] text-rose-700 transition hover:border-rose-300 disabled:opacity-50"
              >
                削除
              </button>
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
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Settings</p>
            <h1 className="text-3xl font-semibold text-slate-900">設定</h1>
            <p className="text-sm text-slate-600">
              しきい値、通知、ストレージなどの設定（モック）。
            </p>
          </div>
          <span className="border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700">
            coming soon
          </span>
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
            <div className="h-12 w-12 border border-slate-200 bg-slate-100">
              {account.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={account.image} alt="avatar" className="h-full w-full object-cover" />
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
                <button
                  onClick={() => unlinkProvider("google")}
                  disabled={unlinking === "google"}
                  className="border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 transition hover:border-red-300 hover:text-red-600 disabled:opacity-50"
                >
                  {unlinking === "google" ? "解除中..." : "連携解除"}
                </button>
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
                <button
                  onClick={() => unlinkProvider("github")}
                  disabled={unlinking === "github"}
                  className="border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 transition hover:border-red-300 hover:text-red-600 disabled:opacity-50"
                >
                  {unlinking === "github" ? "解除中..." : "連携解除"}
                </button>
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

        <div className="border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">AI しきい値</h3>
          <p className="text-sm text-slate-600">
            低・中・高の分岐ポイントを設定（現在: {low} / {high}）。
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
              onClick={saveThresholds}
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
              <h3 className="text-lg font-semibold text-slate-900">Memory</h3>
              <p className="text-sm text-slate-600">
                ユーザー/ワークスペースの前提情報を管理します。
              </p>
            </div>
            {memoryLoading || memoryQuestionLoading ? (
              <span className="text-xs text-slate-500">読み込み中...</span>
            ) : null}
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div className="grid gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                User
              </p>
              {userMemoryTypes.length ? (
                userMemoryTypes.map((type) => (
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
                <p className="text-xs text-slate-500">ユーザー向けMemoryは未設定です。</p>
              )}
            </div>
            <div className="grid gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                Workspace
              </p>
              {workspaceId ? (
                workspaceMemoryTypes.length ? (
                  workspaceMemoryTypes.map((type) => (
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
                  <p className="text-xs text-slate-500">ワークスペース向けMemoryは未設定です。</p>
                )
              ) : (
                <p className="text-xs text-slate-500">ワークスペースを選択すると表示されます。</p>
              )}
            </div>
          </div>
        </div>

        <div className="border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">通知</h3>
          <p className="text-sm text-slate-600">MVPでは通知オフ。後で Slack/メールを追加。</p>
          <div className="mt-3 flex items-center gap-2 text-sm">
            <button
              onClick={() => setNotifications((v) => !v)}
              className="border border-slate-200 bg-white px-4 py-2 text-slate-700 transition hover:border-[#2323eb]/60 hover:text-[#2323eb]"
            >
              通知を{notifications ? "無効化" : "有効化"}
            </button>
            <span className="text-xs text-slate-600">現在: {notifications ? "オン" : "オフ"}</span>
          </div>
        </div>

        <div className="border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">ストレージ</h3>
          <p className="text-sm text-slate-600">MinIO (S3互換) を利用中。後で AWS S3 に切替可。</p>
          <div className="mt-3 flex items-center gap-2 text-sm">
            <button className="border border-slate-200 bg-white px-4 py-2 text-slate-700 transition hover:border-[#2323eb]/60 hover:text-[#2323eb]">
              バケットを確認
            </button>
            <button className="border border-slate-200 bg-white px-4 py-2 text-slate-700 transition hover:border-[#2323eb]/60 hover:text-[#2323eb]">
              接続情報を更新
            </button>
          </div>
        </div>
      </section>

      {activeQuestion ? (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-lg border border-slate-200 bg-white p-6 shadow-lg">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Memory 確認</p>
                <h3 className="text-lg font-semibold text-slate-900">{activeQuestion.type.key}</h3>
                {activeQuestion.type.description ? (
                  <p className="text-xs text-slate-500">{activeQuestion.type.description}</p>
                ) : null}
              </div>
              <span className="border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-700">
                信頼度 {Math.round(activeQuestion.confidence * 100)}%
              </span>
            </div>
            <div className="mt-4 border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">候補値</p>
              <pre className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                {formatQuestionValue(activeQuestion) || "値が未設定です"}
              </pre>
            </div>
            <p className="mt-3 text-xs text-slate-500">この内容をMemoryとして保存しますか？</p>
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
          </div>
        </div>
      ) : null}
    </main>
  );
}
