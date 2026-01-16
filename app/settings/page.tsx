"use client";

import { signOut, useSession } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Sidebar } from "../components/sidebar";
import { AiSuggestionDTO } from "../../lib/types";

export default function SettingsPage() {
  const { update } = useSession();
  const router = useRouter();
  const [low, setLow] = useState(35);
  const [high, setHigh] = useState(70);
  const [notifications, setNotifications] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [aiLogs, setAiLogs] = useState<AiSuggestionDTO[]>([]);
  const [account, setAccount] = useState({ name: "", email: "", image: "" });
  const [accountDirty, setAccountDirty] = useState(false);

  const fetchThresholds = useCallback(async () => {
    const res = await fetch("/api/automation");
    const data = await res.json();
    setLow(data.low ?? 35);
    setHigh(data.high ?? 70);
    setDirty(false);
  }, []);

  const fetchAiLogs = useCallback(async () => {
    const res = await fetch("/api/ai/logs");
    const data = await res.json();
    setAiLogs(data.logs ?? []);
  }, []);

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

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchThresholds();
    void fetchAiLogs();
    void fetchAccount();
  }, [fetchThresholds, fetchAiLogs, fetchAccount]);

  const saveThresholds = async () => {
    await fetch("/api/automation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ low, high }),
    });
    setDirty(false);
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-7xl gap-6 px-4 py-10 lg:px-6 lg:py-14">
      <Sidebar splitThreshold={8} />
      <main className="flex-1 space-y-6">
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
            <h3 className="text-lg font-semibold text-slate-900">AI しきい値</h3>
            <p className="text-sm text-slate-600">
              低・中・高の分岐ポイントを設定（現在: {low} / {high}）。
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

          <div className="border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">AI 提案ログ</h3>
              <button
                onClick={fetchAiLogs}
                className="border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700 transition hover:border-[#2323eb]/60 hover:text-[#2323eb]"
              >
                更新
              </button>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {aiLogs.length ? (
                aiLogs.map((log) => (
                  <div
                    key={log.id}
                    className="border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
                  >
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>{log.type}</span>
                      <span>
                        {log.createdAt
                          ? new Date(log.createdAt).toLocaleString()
                          : ""}
                      </span>
                    </div>
                    <p className="mt-2 font-semibold text-slate-900">{log.inputTitle}</p>
                    {log.inputDescription ? (
                      <p className="text-xs text-slate-600">{log.inputDescription}</p>
                    ) : null}
                    <p className="mt-2 text-xs text-slate-600">
                      {log.output.length > 120 ? `${log.output.slice(0, 120)}...` : log.output}
                    </p>
                  </div>
                ))
              ) : (
                <div className="text-sm text-slate-500">ログがまだありません。</div>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
