"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { TASK_TYPE } from "../../lib/types";
import { useWorkspaceId } from "./use-workspace-id";
import { useWorkspaceStore } from "../../lib/stores/workspace-store";
import { LoadingButton } from "./loading-button";

type IntakeItem = {
  id: string;
  title: string;
  body: string;
  source: string;
  workspaceId: string | null;
  createdAt: string;
};

type DuplicateTask = {
  id: string;
  title: string;
  status: string;
  score: number;
};

const taskTypeOptions = [
  { value: TASK_TYPE.PBI, label: "PBI" },
  { value: TASK_TYPE.TASK, label: "タスク" },
];

export function InboxWidget() {
  const { workspaceId, ready } = useWorkspaceId();
  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const [globalItems, setGlobalItems] = useState<IntakeItem[]>([]);
  const [workspaceItems, setWorkspaceItems] = useState<IntakeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [targetScope, setTargetScope] = useState<"global" | "workspace">("global");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicatesMap, setDuplicatesMap] = useState<Record<string, DuplicateTask[]>>({});
  const [workspaceChoice, setWorkspaceChoice] = useState<Record<string, string>>({});
  const [taskTypeChoice, setTaskTypeChoice] = useState<Record<string, string>>({});
  const [analysisLoadingId, setAnalysisLoadingId] = useState<string | null>(null);

  const workspaceOptions = useMemo(() => workspaces ?? [], [workspaces]);

  const fetchIntake = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    try {
      const res = await fetch("/api/intake");
      if (!res.ok) return;
      const data = await res.json();
      setGlobalItems(data.globalItems ?? []);
      setWorkspaceItems(data.workspaceItems ?? []);
    } finally {
      setLoading(false);
    }
  }, [ready]);

  useEffect(() => {
    void fetchIntake();
  }, [fetchIntake, workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;
    setWorkspaceChoice((prev) => {
      const next = { ...prev };
      globalItems.forEach((item) => {
        if (!next[item.id]) next[item.id] = workspaceId;
      });
      return next;
    });
  }, [workspaceId, globalItems]);

  const submitMemo = async () => {
    if (!text.trim()) return;
    if (targetScope === "workspace" && !workspaceId) {
      setError("ワークスペースを選択してください。");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/intake/memo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          workspaceId: targetScope === "workspace" ? workspaceId : null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.error?.message ?? "インボックス登録に失敗しました。");
        return;
      }
      const data = await res.json();
      const item = data.item as IntakeItem;
      if (item.workspaceId) {
        setWorkspaceItems((prev) => [item, ...prev]);
      } else {
        setGlobalItems((prev) => [item, ...prev]);
      }
      if (data.duplicates?.length) {
        setDuplicatesMap((prev) => ({ ...prev, [item.id]: data.duplicates }));
      }
      setText("");
    } finally {
      setSaving(false);
    }
  };

  const analyzeDuplicates = async (itemId: string, selectedWorkspaceId: string | null) => {
    if (!selectedWorkspaceId) return;
    setAnalysisLoadingId(itemId);
    try {
      const res = await fetch("/api/intake/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intakeId: itemId, workspaceId: selectedWorkspaceId }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setDuplicatesMap((prev) => ({ ...prev, [itemId]: data.duplicates ?? [] }));
    } finally {
      setAnalysisLoadingId(null);
    }
  };

  const resolveIntake = async (params: {
    intakeId: string;
    action: "create" | "merge" | "dismiss";
    workspaceId?: string | null;
    taskType?: string;
    targetTaskId?: string;
  }) => {
    const res = await fetch("/api/intake/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (!res.ok) return;
    setGlobalItems((prev) => prev.filter((item) => item.id !== params.intakeId));
    setWorkspaceItems((prev) => prev.filter((item) => item.id !== params.intakeId));
    setDuplicatesMap((prev) => {
      const next = { ...prev };
      delete next[params.intakeId];
      return next;
    });
  };

  const renderItem = (item: IntakeItem, scope: "global" | "workspace") => {
    const selectedWorkspaceId =
      scope === "workspace" ? item.workspaceId : workspaceChoice[item.id] ?? null;
    const selectedTaskType = taskTypeChoice[item.id] ?? TASK_TYPE.PBI;
    const duplicates = duplicatesMap[item.id] ?? [];
    return (
      <div key={item.id} className="border border-slate-200 bg-white px-4 py-3 text-sm">
        <div className="flex items-center justify-between">
          <p className="font-semibold text-slate-900">{item.title}</p>
          <span className="text-[11px] uppercase tracking-[0.2em] text-slate-400">
            {scope === "global" ? "Global" : "Workspace"}
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-600">{item.body}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
          {scope === "global" ? (
            <label className="flex items-center gap-2">
              <span>割当</span>
              <select
                value={selectedWorkspaceId ?? ""}
                onChange={(event) =>
                  setWorkspaceChoice((prev) => ({
                    ...prev,
                    [item.id]: event.target.value,
                  }))
                }
                className="border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700"
              >
                <option value="">未割当</option>
                {workspaceOptions.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="flex items-center gap-2">
            <span>種別</span>
            <select
              value={selectedTaskType}
              onChange={(event) =>
                setTaskTypeChoice((prev) => ({
                  ...prev,
                  [item.id]: event.target.value,
                }))
              }
              className="border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700"
            >
              {taskTypeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
          <LoadingButton
            onClick={() => analyzeDuplicates(item.id, selectedWorkspaceId)}
            loading={analysisLoadingId === item.id}
            className="border border-slate-200 bg-slate-50 px-2 py-1 text-slate-700 transition hover:border-[#2323eb]/60 hover:text-[#2323eb]"
          >
            重複候補を見る
          </LoadingButton>
          <button
            onClick={() =>
              resolveIntake({
                intakeId: item.id,
                action: "create",
                workspaceId: selectedWorkspaceId,
                taskType: selectedTaskType,
              })
            }
            disabled={!selectedWorkspaceId}
            className="border border-emerald-200 bg-emerald-50 px-2 py-1 font-semibold text-emerald-700 transition hover:border-emerald-300 disabled:opacity-50"
          >
            新規作成
          </button>
          <button
            onClick={() => resolveIntake({ intakeId: item.id, action: "dismiss" })}
            className="border border-slate-200 bg-white px-2 py-1 text-slate-600 transition hover:border-slate-300"
          >
            破棄
          </button>
        </div>
        {duplicates.length ? (
          <div className="mt-3 border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
            <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">
              Duplicate candidates
            </p>
            <div className="mt-2 grid gap-2">
              {duplicates.map((dup) => (
                <div key={dup.id} className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">{dup.title}</p>
                    <p className="text-[11px] text-slate-500">
                      類似度 {Math.round(dup.score * 100)}%
                    </p>
                  </div>
                  <button
                    onClick={() =>
                      resolveIntake({
                        intakeId: item.id,
                        action: "merge",
                        workspaceId: selectedWorkspaceId,
                        targetTaskId: dup.id,
                      })
                    }
                    className="border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700 transition hover:border-amber-300"
                  >
                    マージ
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <section className="border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Inbox</p>
          <h2 className="text-lg font-semibold text-slate-900">未分類メモ</h2>
        </div>
        {loading ? <span className="text-xs text-slate-500">Loading...</span> : null}
      </div>

      <div className="mt-4 grid gap-3">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={3}
          placeholder="メモを貼り付けてインボックスへ"
          className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
        />
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
          <label className="flex items-center gap-2">
            <span>保存先</span>
            <select
              value={targetScope}
              onChange={(event) =>
                setTargetScope(event.target.value as "global" | "workspace")
              }
              className="border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
            >
              <option value="global">Global Inbox</option>
              <option value="workspace">現在のWorkspace</option>
            </select>
          </label>
          {error ? <span className="text-rose-600">{error}</span> : null}
          <LoadingButton
            onClick={submitMemo}
            loading={saving}
            className="border border-[#2323eb]/60 bg-[#2323eb]/10 px-3 py-1 text-xs font-semibold text-[#2323eb] transition hover:border-[#2323eb]"
          >
            Inboxに送る
          </LoadingButton>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="grid gap-3">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Global Inbox</span>
            <span>{globalItems.length} 件</span>
          </div>
          {globalItems.length ? (
            globalItems.map((item) => renderItem(item, "global"))
          ) : (
            <p className="text-xs text-slate-500">未割当のメモはありません。</p>
          )}
        </div>
        <div className="grid gap-3">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Workspace Inbox</span>
            <span>{workspaceItems.length} 件</span>
          </div>
          {workspaceItems.length ? (
            workspaceItems.map((item) => renderItem(item, "workspace"))
          ) : (
            <p className="text-xs text-slate-500">このワークスペースのメモはありません。</p>
          )}
        </div>
      </div>
    </section>
  );
}
