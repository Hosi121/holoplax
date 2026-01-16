"use client";

import { useCallback, useEffect, useState } from "react";
import { Sidebar } from "../../components/sidebar";

type AuditLog = {
  id: string;
  action: string;
  createdAt: string;
  actor: { name: string | null; email: string | null };
  targetUser?: { name: string | null; email: string | null } | null;
  targetWorkspace?: { name: string | null } | null;
  metadata?: Record<string, unknown> | null;
};

export default function AdminAuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/admin/audit");
    if (!res.ok) {
      setError(res.status === 403 ? "権限がありません。" : "取得に失敗しました。");
      return;
    }
    const data = await res.json();
    setLogs(data.logs ?? []);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchLogs();
  }, [fetchLogs]);

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
              <h1 className="text-3xl font-semibold text-slate-900">監査ログ</h1>
              <p className="text-sm text-slate-600">管理者操作の履歴を記録します。</p>
            </div>
            <button
              onClick={fetchLogs}
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
              <div className="grid grid-cols-[1fr_1fr_1.1fr_0.8fr] gap-3 border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                <span>操作</span>
                <span>操作者</span>
                <span>対象</span>
                <span>時刻</span>
              </div>
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="grid grid-cols-[1fr_1fr_1.1fr_0.8fr] gap-3 border border-slate-200 px-3 py-2 text-sm text-slate-800"
                >
                  <span className="text-xs uppercase text-slate-600">{log.action}</span>
                  <span className="text-xs text-slate-600">
                    {log.actor?.name ?? log.actor?.email ?? "-"}
                  </span>
                  <span className="text-xs text-slate-600">
                    {log.targetUser?.name ??
                      log.targetUser?.email ??
                      log.targetWorkspace?.name ??
                      "-"}
                  </span>
                  <span className="text-xs text-slate-500">
                    {new Date(log.createdAt).toLocaleString()}
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
