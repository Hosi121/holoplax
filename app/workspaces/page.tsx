"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { useWorkspaceStore } from "../../lib/stores/workspace-store";
import { useToast } from "../components/toast";
import { ConfirmDialog } from "../components/ui/confirm-dialog";
import { InlineError, Skeleton } from "../components/ui/feedback";

type WorkspaceRow = {
  id: string;
  name: string;
  role: string;
  ownerId: string;
};

type MemberRow = {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
};

const roleLabels: Record<string, string> = {
  owner: "所有者",
  admin: "管理者",
  member: "メンバー",
};

export default function WorkspacesPage() {
  const toast = useToast();
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchWorkspaces = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await apiFetch("/api/workspaces");
      if (!res.ok) {
        setLoadError("ワークスペースを読み込めませんでした。");
        return;
      }
      const data = await res.json();
      setWorkspaces(data.workspaces ?? []);
      if (!selectedId && data.workspaces?.[0]?.id) {
        setSelectedId(data.workspaces[0].id);
      }
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  const fetchMembers = useCallback(async (workspaceId: string) => {
    setMemberError(null);
    try {
      const res = await apiFetch(`/api/workspaces/${workspaceId}/members`);
      if (!res.ok) {
        setMemberError("メンバーを読み込めませんでした。");
        return;
      }
      const data = await res.json();
      setMembers(data.members ?? []);
    } catch {
      setMemberError("メンバーを読み込めませんでした。");
    }
  }, []);

  useEffect(() => {
    void fetchWorkspaces();
  }, [fetchWorkspaces]);

  useEffect(() => {
    if (!selectedId) return;
    void fetchMembers(selectedId);
  }, [selectedId, fetchMembers]);

  const selectedWorkspace = useMemo(
    () => workspaces.find((w) => w.id === selectedId) ?? null,
    [workspaces, selectedId],
  );

  return (
    <main className="max-w-6xl flex-1 space-y-6 px-4 py-10 lg:ml-60 lg:px-6 lg:py-14">
      <header className="border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500">設定</p>
            <h1 className="text-3xl font-semibold text-slate-900">ワークスペース</h1>
            <p className="text-sm text-slate-600">チーム共有と権限管理を行います。</p>
          </div>
        </div>
      </header>

      {loadError ? (
        <InlineError message={loadError} onRetry={() => void fetchWorkspaces()} />
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">ワークスペース一覧</h2>
          <div className="mt-4 grid gap-2">
            {loading ? <Skeleton className="h-16 w-full" /> : null}
            {!loading && !workspaces.length ? (
              <p className="text-sm text-slate-500">まだワークスペースがありません。</p>
            ) : null}
            {workspaces.map((workspace) => (
              <button
                key={workspace.id}
                onClick={async () => {
                  setSelectedId(workspace.id);
                  try {
                    await useWorkspaceStore.getState().setWorkspaceId(workspace.id);
                  } catch {
                    toast.error("ワークスペースを切り替えられませんでした。");
                  }
                }}
                className={`border px-3 py-2 text-left text-sm transition ${
                  selectedId === workspace.id
                    ? "border-[#2323eb]/40 bg-[#2323eb]/10 text-[#2323eb]"
                    : "border-slate-200 text-slate-700 hover:border-[#2323eb]/40 hover:bg-[#2323eb]/5"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{workspace.name}</span>
                  <span className="text-xs text-slate-500">
                    {roleLabels[workspace.role] ?? workspace.role}
                  </span>
                </div>
              </button>
            ))}
          </div>
          <div className="mt-4 border-t border-slate-200 pt-4">
            <h3 className="text-sm font-semibold text-slate-900">新規作成</h3>
            <div className="mt-2 flex gap-2">
              <label className="flex-1">
                <span className="sr-only">ワークスペース名</span>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="ワークスペース名"
                  className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-[#2323eb]"
                />
              </label>
              <button
                onClick={async () => {
                  if (!newName.trim()) return;
                  const res = await apiFetch("/api/workspaces", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name: newName }),
                  });
                  if (res.ok) {
                    const data = await res.json();
                    setNewName("");
                    fetchWorkspaces();
                    if (data?.workspace?.id) {
                      setSelectedId(data.workspace.id);
                      try {
                        await useWorkspaceStore.getState().setWorkspaceId(data.workspace.id);
                      } catch {
                        toast.error("作成したワークスペースへ切り替えられませんでした。");
                      }
                      useWorkspaceStore.getState().fetchWorkspaces();
                    }
                    toast.success("ワークスペースを作成しました。");
                  } else {
                    toast.error("ワークスペースを作成できませんでした。");
                  }
                }}
                className="border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700 transition hover:border-[#2323eb]/60 hover:text-[#2323eb]"
              >
                追加
              </button>
            </div>
          </div>
        </div>

        <div className="border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">メンバー</h2>
            <button
              onClick={() => {
                if (selectedId) fetchMembers(selectedId);
              }}
              className="border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 transition hover:border-[#2323eb]/60 hover:text-[#2323eb]"
            >
              更新
            </button>
          </div>
          {selectedWorkspace ? (
            <>
              {memberError ? (
                <div className="mt-4">
                  <InlineError
                    message={memberError}
                    onRetry={() => selectedId && void fetchMembers(selectedId)}
                  />
                </div>
              ) : null}
              <div className="mt-4 grid gap-2">
                {members.map((member) => (
                  <div
                    key={member.id}
                    className="grid gap-3 border border-slate-200 px-3 py-3 text-sm text-slate-700 sm:grid-cols-[1.1fr_1fr_0.7fr_auto] sm:items-center"
                  >
                    <span className="truncate">{member.name ?? "名前未設定"}</span>
                    <span className="truncate text-xs text-slate-500">{member.email ?? "-"}</span>
                    <select
                      value={member.role}
                      onChange={async (event) => {
                        if (!selectedId) return;
                        const res = await apiFetch(
                          `/api/workspaces/${selectedId}/members/${member.id}`,
                          {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ role: event.target.value }),
                          },
                        );
                        if (!res.ok) {
                          toast.error("権限を変更できませんでした。");
                          void fetchMembers(selectedId);
                          return;
                        }
                        toast.success("権限を変更しました。");
                        void fetchMembers(selectedId);
                      }}
                      className="border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600"
                    >
                      <option value="member">メンバー</option>
                      <option value="admin">管理者</option>
                      <option value="owner">所有者</option>
                    </select>
                    <ConfirmDialog
                      title="メンバーを削除しますか？"
                      description={`${member.name ?? member.email ?? "このメンバー"}はワークスペースにアクセスできなくなります。`}
                      confirmLabel="削除する"
                      onConfirm={async () => {
                        if (!selectedId) return;
                        const res = await apiFetch(
                          `/api/workspaces/${selectedId}/members/${member.id}`,
                          { method: "DELETE" },
                        );
                        if (!res.ok) {
                          toast.error("メンバーを削除できませんでした。");
                          return;
                        }
                        toast.success("メンバーを削除しました。");
                        void fetchMembers(selectedId);
                      }}
                      trigger={
                        <button
                          type="button"
                          className="border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 hover:border-red-300 hover:text-red-600"
                        >
                          削除
                        </button>
                      }
                    />
                  </div>
                ))}
              </div>

              <div className="mt-4 border-t border-slate-200 pt-4">
                <h3 className="text-sm font-semibold text-slate-900">招待</h3>
                <div className="mt-2 flex gap-2">
                  <label className="flex-1">
                    <span className="sr-only">招待するメールアドレス</span>
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="email@example.com"
                      className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-[#2323eb]"
                    />
                  </label>
                  <button
                    onClick={async () => {
                      if (!selectedId || !inviteEmail.trim()) return;
                      setError(null);
                      const res = await apiFetch(`/api/workspaces/${selectedId}/invites`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ email: inviteEmail }),
                      });
                      if (!res.ok) {
                        setError("招待に失敗しました。");
                        return;
                      }
                      const data = await res.json();
                      setInviteLink(data.inviteUrl ?? null);
                      setInviteEmail("");
                    }}
                    className="border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700 transition hover:border-[#2323eb]/60 hover:text-[#2323eb]"
                  >
                    招待リンク作成
                  </button>
                </div>
                {inviteLink ? (
                  <div className="mt-2 flex flex-col gap-2 border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 sm:flex-row sm:items-center">
                    <span className="min-w-0 flex-1 break-all">招待リンク: {inviteLink}</span>
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(inviteLink);
                          toast.success("招待リンクをコピーしました。");
                        } catch {
                          toast.error("招待リンクをコピーできませんでした。");
                        }
                      }}
                      className="shrink-0 border border-slate-200 bg-white px-3 py-1.5 text-slate-700"
                    >
                      コピー
                    </button>
                  </div>
                ) : null}
                {error ? (
                  <div className="mt-2 border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {error}
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <p className="mt-4 text-sm text-slate-500">ワークスペースを選択してください。</p>
          )}
        </div>
      </section>
    </main>
  );
}
