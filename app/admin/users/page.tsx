"use client";

import { useCallback, useEffect, useState } from "react";
import { Sidebar } from "../../components/sidebar";

type UserRow = {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  createdAt: string;
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState<string | null>(null);

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
          {error ? (
            <div className="border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : (
            <div className="grid gap-2">
              <div className="grid grid-cols-[1.4fr_1fr_0.6fr_0.8fr] gap-3 border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                <span>ユーザー</span>
                <span>メール</span>
                <span>権限</span>
                <span>作成日</span>
              </div>
              {users.map((user) => (
                <div
                  key={user.id}
                  className="grid grid-cols-[1.4fr_1fr_0.6fr_0.8fr] gap-3 border border-slate-200 px-3 py-2 text-sm text-slate-800"
                >
                  <span className="truncate">{user.name ?? "Unnamed"}</span>
                  <span className="truncate text-slate-600">{user.email ?? "-"}</span>
                  <span className="text-xs uppercase text-slate-500">{user.role}</span>
                  <span className="text-xs text-slate-500">
                    {new Date(user.createdAt).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
