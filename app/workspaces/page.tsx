"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Sidebar } from "../components/sidebar";

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

export default function WorkspacesPage() {
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchWorkspaces = useCallback(async () => {
    const res = await fetch("/api/workspaces");
    if (!res.ok) return;
    const data = await res.json();
    setWorkspaces(data.workspaces ?? []);
    if (!selectedId && data.workspaces?.[0]?.id) {
      setSelectedId(data.workspaces[0].id);
    }
  }, [selectedId]);

  const fetchMembers = useCallback(async (workspaceId: string) => {
    const res = await fetch(`/api/workspaces/${workspaceId}/members`);
    if (!res.ok) return;
    const data = await res.json();
    setMembers(data.members ?? []);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchWorkspaces();
  }, [fetchWorkspaces]);

  useEffect(() => {
    if (!selectedId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchMembers(selectedId);
  }, [selectedId, fetchMembers]);

  const selectedWorkspace = useMemo(
    () => workspaces.find((w) => w.id === selectedId) ?? null,
    [workspaces, selectedId],
  );

  return (
    <div className="relative min-h-screen bg-white">
      <Sidebar />
      <main className="max-w-6xl flex-1 space-y-6 px-4 py-10 lg:ml-60 lg:px-6 lg:py-14">
        <header className="border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-slate-500">
                Workspace
              </p>
              <h1 className="text-3xl font-semibold text-slate-900">ワークスペース</h1>
              <p className="text-sm text-slate-600">チーム共有と権限管理を行います。</p>
            </div>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
          <div className="border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">ワークスペース一覧</h2>
            <div className="mt-4 grid gap-2">
              {workspaces.map((workspace) => (
                <button
                  key={workspace.id}
                  onClick={async () => {
                    setSelectedId(workspace.id);
                    await fetch("/api/workspaces/current", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ workspaceId: workspace.id }),
                    });
                    window.dispatchEvent(
                      new CustomEvent("workspace:changed", {
                        detail: { workspaceId: workspace.id },
                      }),
                    );
                  }}
                  className={`border px-3 py-2 text-left text-sm transition ${selectedId === workspace.id
                    ? "border-[#2323eb]/40 bg-[#2323eb]/10 text-[#2323eb]"
                    : "border-slate-200 text-slate-700 hover:border-[#2323eb]/40 hover:bg-[#2323eb]/5"
                    }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{workspace.name}</span>
                    <span className="text-xs uppercase text-slate-500">{workspace.role}</span>
                  </div>
                </button>
              ))}
            </div>
            <div className="mt-4 border-t border-slate-200 pt-4">
              <h3 className="text-sm font-semibold text-slate-900">新規作成</h3>
              <div className="mt-2 flex gap-2">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Workspace name"
                  className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-[#2323eb]"
                />
                <button
                  onClick={async () => {
                    if (!newName.trim()) return;
                    const res = await fetch("/api/workspaces", {
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
                        await fetch("/api/workspaces/current", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ workspaceId: data.workspace.id }),
                        });
                        window.dispatchEvent(
                          new CustomEvent("workspace:changed", {
                            detail: { workspaceId: data.workspace.id },
                          }),
                        );
                      }
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
                <div className="mt-4 grid gap-2">
                  {members.map((member) => (
                    <div
                      key={member.id}
                      className="grid grid-cols-[1.1fr_1fr_0.6fr_0.6fr] items-center gap-3 border border-slate-200 px-3 py-2 text-sm text-slate-700"
                    >
                      <span className="truncate">{member.name ?? "Unnamed"}</span>
                      <span className="truncate text-xs text-slate-500">
                        {member.email ?? "-"}
                      </span>
                      <select
                        value={member.role}
                        onChange={async (event) => {
                          if (!selectedId) return;
                          await fetch(`/api/workspaces/${selectedId}/members/${member.id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ role: event.target.value }),
                          });
                          fetchMembers(selectedId);
                        }}
                        className="border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600"
                      >
                        <option value="member">member</option>
                        <option value="admin">admin</option>
                        <option value="owner">owner</option>
                      </select>
                      <button
                        onClick={async () => {
                          if (!selectedId) return;
                          await fetch(`/api/workspaces/${selectedId}/members/${member.id}`, {
                            method: "DELETE",
                          });
                          fetchMembers(selectedId);
                        }}
                        className="border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 transition hover:border-red-300 hover:text-red-600"
                      >
                        削除
                      </button>
                    </div>
                  ))}
                </div>

                <div className="mt-4 border-t border-slate-200 pt-4">
                  <h3 className="text-sm font-semibold text-slate-900">招待</h3>
                  <div className="mt-2 flex gap-2">
                    <input
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="email@example.com"
                      className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-[#2323eb]"
                    />
                    <button
                      onClick={async () => {
                        if (!selectedId || !inviteEmail.trim()) return;
                        setError(null);
                        const res = await fetch(`/api/workspaces/${selectedId}/invites`, {
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
                    <div className="mt-2 border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                      招待リンク: {inviteLink}
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
    </div>
  );
}
