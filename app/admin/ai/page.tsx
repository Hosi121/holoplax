"use client";

import { useCallback, useEffect, useState } from "react";

type AiSetting = {
  model: string;
  baseUrl: string;
  enabled: boolean;
  hasApiKey: boolean;
  source?: "db" | "env";
};

const modelPresets = [
  "gpt-4o-mini",
  "gpt-4o",
  "openai/gpt-4o-mini",
  "anthropic/claude-3-5-sonnet-20240620",
  "anthropic/claude-3-5-haiku-20241022",
  "gemini/gemini-1.5-flash",
  "gemini/gemini-1.5-pro",
];

const modelDefault = "gpt-4o-mini";
const baseUrlPlaceholder = "http://localhost:4000";

export default function AdminAiSettingsPage() {
  const [setting, setSetting] = useState<AiSetting | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [error, setError] = useState<string | null>(null);

  const fetchSetting = useCallback(async () => {
    setError(null);
    const res = await fetch("/api/admin/ai");
    if (!res.ok) {
      setError(res.status === 403 ? "権限がありません。" : "取得に失敗しました。");
      return;
    }
    const data = await res.json();
    setSetting(data.setting ?? null);
    setApiKey("");
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchSetting();
  }, [fetchSetting]);

  const saveSetting = async () => {
    if (!setting) return;
    setStatus("saving");
    setError(null);
    const res = await fetch("/api/admin/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: setting.model,
        baseUrl: setting.baseUrl,
        enabled: setting.enabled,
        apiKey,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.message ?? "保存に失敗しました。");
      setStatus("error");
      return;
    }
    const data = await res.json();
    setSetting(data.setting ?? setting);
    setApiKey("");
    setStatus("saved");
    setTimeout(() => setStatus("idle"), 1500);
  };

  return (
    <main className="max-w-4xl flex-1 space-y-6 px-4 py-10 lg:ml-60 lg:px-6 lg:py-14">
      <header className="border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-slate-500">
              Admin
            </p>
            <h1 className="text-3xl font-semibold text-slate-900">AI設定</h1>
            <p className="text-sm text-slate-600">
              LiteLLM/OpenAI互換ゲートウェイのモデルとAPIキーを設定します。
            </p>
          </div>
          <button
            onClick={fetchSetting}
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
        ) : null}
        {setting ? (
          <div className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-xs text-slate-500">
                モデル
                <div className="grid gap-2">
                  <select
                    value={modelPresets.includes(setting.model) ? setting.model : ""}
                    onChange={(e) =>
                      setSetting((prev) =>
                        prev ? { ...prev, model: e.target.value } : prev,
                      )
                    }
                    className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
                  >
                    <option value="">候補から選択</option>
                    {modelPresets.map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))}
                  </select>
                  <input
                    value={setting.model}
                    onChange={(e) =>
                      setSetting((prev) => (prev ? { ...prev, model: e.target.value } : prev))
                    }
                    placeholder={modelDefault}
                    className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
                  />
                  <p className="text-[11px] text-slate-500">
                    LiteLLMの設定で許可したモデル名を入力してください。
                  </p>
                </div>
              </label>
              <label className="grid gap-1 text-xs text-slate-500">
                Gateway Base URL（任意）
                <input
                  value={setting.baseUrl}
                  onChange={(e) =>
                    setSetting((prev) => (prev ? { ...prev, baseUrl: e.target.value } : prev))
                  }
                  placeholder={baseUrlPlaceholder}
                  className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
                />
              </label>
            </div>
            <label className="grid gap-1 text-xs text-slate-500">
              APIキー（空欄なら変更しない）
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={setting.hasApiKey ? "登録済み" : "未設定"}
                className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={setting.enabled}
                onChange={(e) =>
                  setSetting((prev) => (prev ? { ...prev, enabled: e.target.checked } : prev))
                }
              />
              この設定を有効化する
              {setting.source === "env" ? (
                <span className="text-[11px] text-slate-500">
                  （現在は環境変数の設定を参照）
                </span>
              ) : null}
            </label>
            <div className="flex items-center gap-3">
              <button
                onClick={saveSetting}
                disabled={status === "saving"}
                className="border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700 transition hover:border-[#2323eb]/60 hover:text-[#2323eb] disabled:opacity-50"
              >
                {status === "saving" ? "保存中..." : "保存"}
              </button>
              <span className="text-xs text-slate-500">
                {status === "saved" ? "保存しました。" : ""}
              </span>
            </div>
          </div>
        ) : (
          <div className="text-sm text-slate-500">読み込み中...</div>
        )}
      </section>
    </main>
  );
}
