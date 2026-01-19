"use client";

import { signOut, useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useWorkspaceId } from "../components/use-workspace-id";

type MemoryTypeRow = {
  id: string;
  key: string;
  scope: "USER" | "WORKSPACE";
  valueType: string;
  unit?: string | null;
  granularity: string;
  updatePolicy: string;
  decayDays?: number | null;
  description?: string | null;
};

type MemoryClaimRow = {
  id: string;
  typeId: string;
  valueStr?: string | null;
  valueNum?: number | null;
  valueBool?: boolean | null;
  valueJson?: unknown;
  status: string;
};

type MemoryQuestionRow = {
  id: string;
  typeId: string;
  valueStr?: string | null;
  valueNum?: number | null;
  valueBool?: boolean | null;
  valueJson?: unknown;
  confidence: number;
  status: string;
  createdAt: string;
  type: {
    key: string;
    scope: "USER" | "WORKSPACE";
    valueType: string;
    description?: string | null;
  };
};

const formatClaimValue = (type: MemoryTypeRow, claim?: MemoryClaimRow) => {
  if (!claim) return "";
  if (type.valueType === "STRING") return claim.valueStr ?? "";
  if (type.valueType === "NUMBER" || type.valueType === "DURATION_MS" || type.valueType === "RATIO") {
    return claim.valueNum !== null && claim.valueNum !== undefined ? String(claim.valueNum) : "";
  }
  if (type.valueType === "BOOL") {
    return claim.valueBool === null || claim.valueBool === undefined
      ? ""
      : claim.valueBool
        ? "true"
        : "false";
  }
  if (
    type.valueType === "JSON" ||
    type.valueType === "HISTOGRAM_24x7" ||
    type.valueType === "RATIO_BY_TYPE"
  ) {
    if (claim.valueJson === null || claim.valueJson === undefined) return "";
    return JSON.stringify(claim.valueJson, null, 2);
  }
  return "";
};

const formatQuestionValue = (question: MemoryQuestionRow) => {
  const type = question.type;
  if (type.valueType === "STRING") return question.valueStr ?? "";
  if (type.valueType === "NUMBER" || type.valueType === "DURATION_MS" || type.valueType === "RATIO") {
    return question.valueNum !== null && question.valueNum !== undefined
      ? String(question.valueNum)
      : "";
  }
  if (type.valueType === "BOOL") {
    if (question.valueBool === null || question.valueBool === undefined) return "";
    return question.valueBool ? "true" : "false";
  }
  if (
    type.valueType === "JSON" ||
    type.valueType === "HISTOGRAM_24x7" ||
    type.valueType === "RATIO_BY_TYPE"
  ) {
    if (question.valueJson === null || question.valueJson === undefined) return "";
    return JSON.stringify(question.valueJson, null, 2);
  }
  return "";
};

export default function SettingsPage() {
  const { update } = useSession();
  const router = useRouter();
  const { workspaceId, ready } = useWorkspaceId();
  const [low, setLow] = useState(35);
  const [high, setHigh] = useState(70);
  const [notifications, setNotifications] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [account, setAccount] = useState({ name: "", email: "", image: "" });
  const [accountDirty, setAccountDirty] = useState(false);
  const [memoryTypes, setMemoryTypes] = useState<MemoryTypeRow[]>([]);
  const [memoryClaims, setMemoryClaims] = useState<Record<string, MemoryClaimRow>>({});
  const [memoryDrafts, setMemoryDrafts] = useState<Record<string, string>>({});
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [memorySavingId, setMemorySavingId] = useState<string | null>(null);
  const [memoryRemovingId, setMemoryRemovingId] = useState<string | null>(null);
  const [memoryQuestions, setMemoryQuestions] = useState<MemoryQuestionRow[]>([]);
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [memoryQuestionLoading, setMemoryQuestionLoading] = useState(false);
  const [memoryQuestionActionId, setMemoryQuestionActionId] = useState<string | null>(null);

  const fetchThresholds = useCallback(async () => {
    if (!ready) return;
    if (!workspaceId) {
      setLow(35);
      setHigh(70);
      setDirty(false);
      return;
    }
    const res = await fetch("/api/automation");
    const data = await res.json();
    setLow(data.low ?? 35);
    setHigh(data.high ?? 70);
    setDirty(false);
  }, [ready, workspaceId]);

  const fetchAccount = useCallback(async () => {
    const res = await fetch("/api/account");
    if (!res.ok) return;
    const data = await res.json();
    setAccount({
      name: data.user?.name ?? "",
      email: data.user?.email ?? "",
      image: data.user?.image ?? "",
    });
    setAccountDirty(false);
  }, []);

  const fetchMemory = useCallback(async () => {
    if (!ready) return;
    setMemoryLoading(true);
    try {
      const currentWorkspaceId = workspaceId;
      void currentWorkspaceId;
      const res = await fetch("/api/memory");
      if (!res.ok) return;
      const data = await res.json();
      const types: MemoryTypeRow[] = data.types ?? [];
      const claimMap: Record<string, MemoryClaimRow> = {};
      (data.userClaims ?? []).forEach((claim: MemoryClaimRow) => {
        claimMap[claim.typeId] = claim;
      });
      (data.workspaceClaims ?? []).forEach((claim: MemoryClaimRow) => {
        claimMap[claim.typeId] = claim;
      });
      const drafts: Record<string, string> = {};
      types.forEach((type) => {
        drafts[type.id] = formatClaimValue(type, claimMap[type.id]);
      });
      setMemoryTypes(types);
      setMemoryClaims(claimMap);
      setMemoryDrafts(drafts);
    } finally {
      setMemoryLoading(false);
    }
  }, [ready, workspaceId]);

  const fetchMemoryQuestions = useCallback(async () => {
    if (!ready) return;
    setMemoryQuestionLoading(true);
    try {
      const res = await fetch("/api/memory/questions");
      if (!res.ok) return;
      const data = await res.json();
      setMemoryQuestions(data.questions ?? []);
    } finally {
      setMemoryQuestionLoading(false);
    }
  }, [ready]);

  useEffect(() => {
    void fetchThresholds();
    void fetchAccount();
    void fetchMemory();
    void fetchMemoryQuestions();
  }, [fetchThresholds, fetchAccount, fetchMemory, fetchMemoryQuestions]);

  const saveThresholds = async () => {
    await fetch("/api/automation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ low, high }),
    });
    setDirty(false);
  };

  const handleMemoryDraftChange = (typeId: string, value: string) => {
    setMemoryDrafts((prev) => ({ ...prev, [typeId]: value }));
  };

  const saveMemory = async (type: MemoryTypeRow) => {
    const value = memoryDrafts[type.id];
    if (value === undefined || value === "") {
      window.alert("値を入力してください。");
      return;
    }
    setMemorySavingId(type.id);
    try {
      const res = await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ typeId: type.id, value }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.claim) {
        setMemoryClaims((prev) => ({ ...prev, [type.id]: data.claim }));
        setMemoryDrafts((prev) => ({
          ...prev,
          [type.id]: formatClaimValue(type, data.claim),
        }));
      }
    } finally {
      setMemorySavingId(null);
    }
  };

  const removeMemory = async (type: MemoryTypeRow) => {
    const claim = memoryClaims[type.id];
    if (!claim) return;
    setMemoryRemovingId(claim.id);
    try {
      const res = await fetch("/api/memory", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimId: claim.id }),
      });
      if (!res.ok) return;
      setMemoryClaims((prev) => {
        const next = { ...prev };
        delete next[type.id];
        return next;
      });
      setMemoryDrafts((prev) => ({ ...prev, [type.id]: "" }));
    } finally {
      setMemoryRemovingId(null);
    }
  };

  const respondMemoryQuestion = async (
    question: MemoryQuestionRow,
    action: "accept" | "reject" | "hold",
  ) => {
    setMemoryQuestionActionId(question.id);
    try {
      const res = await fetch(`/api/memory/questions/${question.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) return;
      setMemoryQuestions((prev) => prev.filter((item) => item.id !== question.id));
      if (action === "accept") {
        void fetchMemory();
      }
    } finally {
      setMemoryQuestionActionId(null);
    }
  };

  const userMemoryTypes = memoryTypes.filter((type) => type.scope === "USER");
  const workspaceMemoryTypes = memoryTypes.filter((type) => type.scope === "WORKSPACE");
  const activeQuestion = memoryQuestions[0] ?? null;

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
    renderInput: () => JSX.Element;
  }) => (
    <div className="border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">{type.key}</p>
          {type.description ? (
            <p className="text-xs text-slate-500">{type.description}</p>
          ) : null}
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
            <p className="text-xs uppercase tracking-[0.28em] text-slate-500">
              Settings
            </p>
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
        <div
          id="account"
          className="border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900">アカウント</h3>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1 text-xs text-slate-500">
              名前
              <input
                value={account.name}
                onChange={(e) => {
                  setAccount((p) => ({ ...p, name: e.target.value }));
                  setAccountDirty(true);
                }}
                className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
                placeholder="名前"
              />
            </label>
            <label className="grid gap-1 text-xs text-slate-500">
              メール
              <input
                value={account.email}
                onChange={(e) => {
                  setAccount((p) => ({ ...p, email: e.target.value }));
                  setAccountDirty(true);
                }}
                className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
                placeholder="you@example.com"
              />
            </label>
          </div>
          <div className="mt-4 flex items-center gap-4">
            <div className="h-12 w-12 border border-slate-200 bg-slate-100">
              {account.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={account.image}
                  alt="avatar"
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
                  const res = await fetch("/api/storage/avatar", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      filename: file.name,
                      contentType: file.type || "image/png",
                    }),
                  });
                  if (!res.ok) return;
                  const data = await res.json();
                  await fetch(data.uploadUrl, {
                    method: "PUT",
                    headers: { "Content-Type": file.type || "image/png" },
                    body: file,
                  });
                  setAccount((p) => ({ ...p, image: data.publicUrl }));
                  setAccountDirty(true);
                }}
                className="mt-2 block text-xs text-slate-600 file:mr-3 file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-slate-700"
              />
            </label>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={async () => {
                const res = await fetch("/api/account", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(account),
                });
                if (res.ok) {
                  await update({
                    user: {
                      name: account.name || null,
                      email: account.email || null,
                      image: account.image || null,
                    },
                  });
                  router.refresh();
                }
                setAccountDirty(false);
              }}
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

        <div className="border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">AI閾値</h3>
          <p className="text-sm text-slate-600">
            AIによる自動化レベルの設定（現在: {low} / {high}）
          </p>
          <div className="mt-3 flex items-center gap-2 text-sm">
            <input
              type="number"
              value={low}
              onChange={(e) => {
                setLow(Number(e.target.value) || 0);
                setDirty(true);
              }}
              className="w-20 border border-slate-200 px-3 py-2 text-slate-800 outline-none focus:border-[#2323eb]"
            />
            <input
              type="number"
              value={high}
              onChange={(e) => {
                setHigh(Number(e.target.value) || 0);
                setDirty(true);
              }}
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
                ユーザー/ワークスペースの前提情報を管理
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
                    value={memoryDrafts[type.id]}
                    isEditing={editingMemoryId === type.id}
                    onEdit={() => setEditingMemoryId(type.id)}
                    onCancel={() => {
                      setEditingMemoryId(null);
                      setMemoryDrafts((prev) => ({
                        ...prev,
                        [type.id]: formatClaimValue(type, memoryClaims[type.id]),
                      }));
                    }}
                    onSave={() =>
                      saveMemory(type).then(() => setEditingMemoryId(null))
                    }
                    onRemove={() => removeMemory(type)}
                    saving={memorySavingId === type.id}
                    removing={memoryRemovingId === memoryClaims[type.id]?.id}
                    onDraftChange={(value) => handleMemoryDraftChange(type.id, value)}
                    renderInput={() => renderMemoryInput(type)}
                    currentValue={formatClaimValue(type, memoryClaims[type.id])}
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
                      value={memoryDrafts[type.id]}
                      isEditing={editingMemoryId === type.id}
                      onEdit={() => setEditingMemoryId(type.id)}
                      onCancel={() => {
                        setEditingMemoryId(null);
                        setMemoryDrafts((prev) => ({
                          ...prev,
                          [type.id]: formatClaimValue(type, memoryClaims[type.id]),
                        }));
                      }}
                      onSave={() =>
                        saveMemory(type).then(() => setEditingMemoryId(null))
                      }
                      onRemove={() => removeMemory(type)}
                      saving={memorySavingId === type.id}
                      removing={memoryRemovingId === memoryClaims[type.id]?.id}
                      onDraftChange={(value) => handleMemoryDraftChange(type.id, value)}
                      renderInput={() => renderMemoryInput(type)}
                      currentValue={formatClaimValue(type, memoryClaims[type.id])}
                    />
                  ))
                ) : (
                  <p className="text-xs text-slate-500">ワークスペース向けMemoryは未設定です。</p>
                )
              ) : (
                <p className="text-xs text-slate-500">
                  ワークスペースを選択すると表示されます。
                </p>
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
            <span className="text-xs text-slate-600">
              現在: {notifications ? "オン" : "オフ"}
            </span>
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
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                  Memory 確認
                </p>
                <h3 className="text-lg font-semibold text-slate-900">
                  {activeQuestion.type.key}
                </h3>
                {activeQuestion.type.description ? (
                  <p className="text-xs text-slate-500">
                    {activeQuestion.type.description}
                  </p>
                ) : null}
              </div>
              <span className="border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-700">
                信頼度 {Math.round(activeQuestion.confidence * 100)}%
              </span>
            </div>
            <div className="mt-4 border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
              <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
                候補値
              </p>
              <pre className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                {formatQuestionValue(activeQuestion) || "値が未設定です"}
              </pre>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              この内容をMemoryとして保存しますか？
            </p>
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
