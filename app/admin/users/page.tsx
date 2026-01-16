"use client";

import { useCallback, useEffect, useState } from "react";
import { Sidebar } from "../../components/sidebar";

type UserRow = {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  disabledAt?: string | null;
  createdAt: string;
  memberships?: {
    role: string;
    workspace: { id: string; name: string };
  }[];
};

type TaskRow = {
  id: string;
  title: string;
  status: string;
  points: number;
  updatedAt: string;
  workspaceName?: string | null;
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formRole, setFormRole] = useState("USER");
  const [openUserId, setOpenUserId] = useState<string | null>(null);
  const [taskLoadingId, setTaskLoadingId] = useState<string | null>(null);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [tasksByUser, setTasksByUser] = useState<Record<string, TaskRow[]>>({});

  const fetchUsers = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/admin/users");
    if (!res.ok) {
      setError(res.status === 403 ? "権限がありません。" : "取得に失敗しました。");
      return;
    }
    const data = await res.json();
    setUsers(data.users ?? []);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchUsers();
  }, [fetchUsers]);

  return (
    <div className="mx-auto flex min-h-screen max-w-7xl gap-6 px-4 py-10 lg:px-6 lg:py-14">
      <Sidebar splitThreshold={8} />
      <main className="flex-1 space-y-6">
        <header className="border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-slate-500">
                Admin
              </p>
              <h1 className="text-3xl font-semibold text-slate-900">ユーザー管理</h1>
              <p className="text-sm text-slate-600">管理者のみ閲覧できます。</p>
            </div>
            <button
              onClick={fetchUsers}
              className="border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 transition hover:border-[#2323eb]/60 hover:text-[#2323eb]"
            >
              更新
            </button>
          </div>
        </header>

        <section className="border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">ユーザー作成</h2>
              <p className="text-sm text-slate-600">
                管理者が新規ユーザーを登録できます。
              </p>
            </div>
          </div>
          {createError ? (
            <div className="mb-4 border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {createError}
            </div>
          ) : null}
          <form
            className="grid gap-4 md:grid-cols-[1.1fr_1.3fr_1.1fr_0.6fr_auto]"
            onSubmit={async (event) => {
              event.preventDefault();
              setCreateError(null);
              setCreating(true);
              try {
                const res = await fetch("/api/admin/users", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    name: formName.trim() || null,
                    email: formEmail.trim(),
                    password: formPassword,
                    role: formRole,
                  }),
                });
                if (!res.ok) {
                  const data = await res.json().catch(() => ({}));
                  setCreateError(data?.error ?? "作成に失敗しました。");
                  return;
                }
                setFormName("");
                setFormEmail("");
                setFormPassword("");
                setFormRole("USER");
                fetchUsers();
              } finally {
                setCreating(false);
              }
            }}
          >
            <label className="grid gap-2 text-xs text-slate-500">
              名前
              <input
                value={formName}
                onChange={(event) => setFormName(event.target.value)}
                className="border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                placeholder="表示名"
              />
            </label>
            <label className="grid gap-2 text-xs text-slate-500">
              メール
              <input
                required
                type="email"
                value={formEmail}
                onChange={(event) => setFormEmail(event.target.value)}
                className="border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                placeholder="name@example.com"
              />
            </label>
            <label className="grid gap-2 text-xs text-slate-500">
              パスワード
              <input
                required
                type="password"
                value={formPassword}
                onChange={(event) => setFormPassword(event.target.value)}
                className="border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                placeholder="8文字以上"
              />
            </label>
            <label className="grid gap-2 text-xs text-slate-500">
              権限
              <select
                value={formRole}
                onChange={(event) => setFormRole(event.target.value)}
                className="border border-slate-200 bg-white px-2 py-2 text-sm text-slate-700"
              >
                <option value="USER">USER</option>
                <option value="ADMIN">ADMIN</option>
              </select>
            </label>
            <button
              type="submit"
              disabled={creating}
              className="mt-6 border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700 transition hover:border-[#2323eb]/60 hover:text-[#2323eb] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creating ? "作成中..." : "作成"}
            </button>
          </form>
        </section>

        <section className="border border-slate-200 bg-white p-6 shadow-sm">
          {error ? (
            <div className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : (
            <div className="grid gap-2">
              <div className="grid grid-cols-[1.2fr_1fr_0.7fr_0.8fr_0.8fr_0.9fr_0.7fr] gap-3 border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                <span>ユーザー</span>
                <span>メール</span>
                <span>権限</span>
                <span>状態</span>
                <span>作成日</span>
                <span>ワークスペース</span>
                <span>タスク</span>
              </div>
              {users.map((user) => {
                const tasks = tasksByUser[user.id];
                const isOpen = openUserId === user.id;
                const groupedTasks = tasks?.reduce<Record<string, TaskRow[]>>(
                  (acc, task) => {
                    const key = task.workspaceName ?? "未所属";
                    if (!acc[key]) acc[key] = [];
                    acc[key].push(task);
                    return acc;
                  },
                  {},
                );
                return (
                  <div key={user.id} className="grid gap-2">
                    <div className="grid grid-cols-[1.2fr_1fr_0.7fr_0.8fr_0.8fr_0.9fr_0.7fr] items-center gap-3 border border-slate-200 px-3 py-2 text-sm text-slate-800">
                      <span className="truncate">{user.name ?? "Unnamed"}</span>
                      <span className="truncate text-slate-600">
                        {user.email ?? "-"}
                      </span>
                      <div className="text-xs uppercase text-slate-500">
                        <select
                          value={user.role}
                          onChange={async (event) => {
                            const next = event.target.value;
                            await fetch(`/api/admin/users/${user.id}`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ role: next }),
                            });
                            fetchUsers();
                          }}
                          className="border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600"
                        >
                          <option value="USER">USER</option>
                          <option value="ADMIN">ADMIN</option>
                        </select>
                      </div>
                      <div className="text-xs">
                        <button
                          onClick={async () => {
                            await fetch(`/api/admin/users/${user.id}`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ disabled: !user.disabledAt }),
                            });
                            fetchUsers();
                          }}
                          className={`border px-2 py-1 text-[11px] ${
                            user.disabledAt
                              ? "border-red-200 bg-red-50 text-red-700"
                              : "border-emerald-200 bg-emerald-50 text-emerald-700"
                          }`}
                        >
                          {user.disabledAt ? "停止中" : "有効"}
                        </button>
                      </div>
                      <span className="text-xs text-slate-500">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </span>
                      <div className="text-xs text-slate-600">
                        {user.memberships && user.memberships.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {user.memberships.slice(0, 2).map((membership) => (
                              <span
                                key={membership.workspace.id}
                                className="border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600"
                              >
                                {membership.workspace.name}
                              </span>
                            ))}
                            {user.memberships.length > 2 ? (
                              <span className="text-[11px] text-slate-400">
                                +{user.memberships.length - 2}
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400">未所属</span>
                        )}
                      </div>
                      <button
                        onClick={async () => {
                          if (isOpen) {
                            setOpenUserId(null);
                            return;
                          }
                          setOpenUserId(user.id);
                          if (tasks) return;
                          setTaskError(null);
                          setTaskLoadingId(user.id);
                          try {
                            const res = await fetch(
                              `/api/admin/users/${user.id}/tasks`,
                            );
                            if (!res.ok) {
                              setTaskError("タスク取得に失敗しました。");
                              return;
                            }
                            const data = await res.json();
                            setTasksByUser((prev) => ({
                              ...prev,
                              [user.id]: data.tasks ?? [],
                            }));
                          } finally {
                            setTaskLoadingId(null);
                          }
                        }}
                        className="border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 transition hover:border-[#2323eb]/60 hover:text-[#2323eb]"
                      >
                        {isOpen ? "閉じる" : "表示"}
                      </button>
                    </div>
                    {isOpen ? (
                      <div className="border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
                        {taskLoadingId === user.id ? (
                          <p className="text-xs text-slate-500">読み込み中...</p>
                        ) : taskError ? (
                          <p className="text-xs text-red-600">{taskError}</p>
                        ) : groupedTasks &&
                          Object.keys(groupedTasks).length > 0 ? (
                          <div className="grid gap-4">
                            {Object.entries(groupedTasks).map(
                              ([workspaceName, workspaceTasks]) => (
                                <div
                                  key={workspaceName}
                                  className="border border-slate-200 bg-white p-4"
                                >
                                  <div className="mb-3 flex items-center justify-between">
                                    <span className="text-sm font-semibold text-slate-800">
                                      {workspaceName}
                                    </span>
                                    <span className="text-xs text-slate-500">
                                      {workspaceTasks.length}件
                                    </span>
                                  </div>
                                  <div className="grid gap-2 text-xs">
                                    <div className="grid grid-cols-[1.6fr_0.6fr_0.4fr] gap-3 text-[11px] uppercase text-slate-500">
                                      <span>タイトル</span>
                                      <span>状態</span>
                                      <span>Pt</span>
                                    </div>
                                    {workspaceTasks.map((task) => (
                                      <div
                                        key={task.id}
                                        className="grid grid-cols-[1.6fr_0.6fr_0.4fr] items-center gap-3 text-xs text-slate-600"
                                      >
                                        <span className="truncate text-slate-800">
                                          {task.title}
                                        </span>
                                        <span className="uppercase">
                                          {task.status}
                                        </span>
                                        <span>{task.points}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ),
                            )}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-500">
                            タスクがありません。
                          </p>
                        )}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
