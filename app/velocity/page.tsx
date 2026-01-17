"use client";

import { useCallback, useEffect, useState } from "react";
import { useWorkspaceId } from "../components/use-workspace-id";
import { VelocityEntryDTO } from "../../lib/types";

export default function VelocityPage() {
  const { workspaceId, ready } = useWorkspaceId();
  const [history, setHistory] = useState<VelocityEntryDTO[]>([]);
  const [form, setForm] = useState({ name: "Sprint-1", points: 22, range: "20-26" });

  const fetchVelocity = useCallback(async () => {
    if (!ready) return;
    if (!workspaceId) {
      setHistory([]);
      return;
    }
    const res = await fetch("/api/velocity");
    const data = await res.json();
    setHistory(data.velocity ?? []);
    const nextNum = (data.velocity?.length ?? 0) + 1;
    setForm((p) => ({ ...p, name: `Sprint-${nextNum}` }));
  }, [ready, workspaceId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchVelocity();
  }, [fetchVelocity]);

  const addEntry = async () => {
    if (!form.name.trim()) return;
    await fetch("/api/velocity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, points: Number(form.points) }),
    });
    void fetchVelocity();
  };

  return (
    <main className="max-w-6xl flex-1 space-y-6 px-4 py-10 lg:ml-60 lg:px-6 lg:py-14">
      <header className="border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-slate-500">
              Velocity
            </p>
            <h1 className="text-3xl font-semibold text-slate-900">ベロシティ</h1>
            <p className="text-sm text-slate-600">スプリント履歴のポイントとレンジを記録。</p>
          </div>
        </div>
      </header>

      <section className="border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-3">
          {history.map((item) => (
            <div
              key={item.id}
              className="border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800"
            >
              <p className="text-slate-500">{item.name}</p>
              <p className="text-2xl font-semibold text-slate-900">{item.points} pt</p>
              <p className="text-xs text-slate-500">レンジ: {item.range}</p>
            </div>
          ))}
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-4">
          <input
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
            placeholder="Sprint-13"
          />
          <input
            type="number"
            value={form.points}
            onChange={(e) => setForm((p) => ({ ...p, points: Number(e.target.value) || 0 }))}
            className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
          />
          <input
            value={form.range}
            onChange={(e) => setForm((p) => ({ ...p, range: e.target.value }))}
            className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
            placeholder="20-26"
          />
          <button
            onClick={addEntry}
            className="border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 transition hover:border-[#2323eb]/60 hover:text-[#2323eb]"
          >
            追加
          </button>
        </div>
      </section>
    </main>
  );
}
