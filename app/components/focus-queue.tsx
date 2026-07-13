"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import { InlineError, Skeleton } from "./ui/feedback";

type FocusItem = {
  taskId: string;
  title: string;
  reason: string;
  dueDate: string | null;
};

type FocusHistory = {
  computedAt: string;
  items: { title?: string; reason?: string }[];
};

export function FocusQueue() {
  const [items, setItems] = useState<FocusItem[]>([]);
  const [history, setHistory] = useState<FocusHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const fetchItems = async () => {
      try {
        const res = await apiFetch("/api/focus-queue");
        if (!res.ok) {
          if (active) setError("優先候補を読み込めませんでした。");
          return;
        }
        const data = await res.json();
        if (!active) return;
        setItems(data.items ?? []);
        setHistory(data.history ?? []);
      } finally {
        if (active) setLoading(false);
      }
    };
    void fetchItems();
    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-500">優先候補</p>
          <h2 className="text-lg font-semibold text-slate-900">次に進めるおすすめ</h2>
        </div>
        <Link href="/backlog" className="text-xs font-semibold text-slate-500 hover:text-[#2323eb]">
          やることへ
        </Link>
      </div>
      {loading ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-3" aria-label="読み込み中">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : error ? (
        <div className="mt-4">
          <InlineError message={error} />
        </div>
      ) : items.length ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {items.map((item) => (
            <div
              key={item.taskId}
              className="border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700"
            >
              <p className="text-xs uppercase text-slate-500">{item.reason}</p>
              <p className="mt-2 text-base font-semibold text-slate-900">{item.title}</p>
              <p className="mt-2 text-xs text-slate-500">
                {item.dueDate
                  ? `期限 ${new Date(item.dueDate).toLocaleDateString("ja-JP")}`
                  : "期限なし"}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-md border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-600">
          <p className="font-semibold text-slate-800">まだ候補がありません。</p>
          <p className="mt-1">やることを追加するとここに表示されます。</p>
          <div className="mt-3 flex gap-2 text-xs">
            <Link
              href="/backlog"
              className="border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700 hover:border-[#2323eb]/50 hover:text-[#2323eb]"
            >
              タスクを追加
            </Link>
          </div>
        </div>
      )}
      {history.length ? (
        <div className="mt-6 border-t border-slate-200 pt-4">
          <p className="text-xs text-slate-500">最近の候補</p>
          <div className="mt-3 grid gap-2 text-xs text-slate-600">
            {history.map((entry, idx) => (
              <div key={`${entry.computedAt}-${idx}`} className="flex flex-col gap-1">
                <span className="text-[11px] text-slate-500">
                  {new Date(entry.computedAt).toLocaleString("ja-JP")}
                </span>
                <span>
                  {entry.items?.[0]?.title ?? "—"} / {entry.items?.[1]?.title ?? "—"} /{" "}
                  {entry.items?.[2]?.title ?? "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
