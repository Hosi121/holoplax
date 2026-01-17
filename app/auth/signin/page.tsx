"use client";

import { Chrome, Github, Lock, Mail, User } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useEffect, useState } from "react";

type Providers = Record<string, { id: string; name: string }>;

export default function SignInPage() {
  const [providers, setProviders] = useState<Providers>({});
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadProviders = async () => {
      const res = await fetch("/api/auth/providers");
      if (res.ok) {
        const data = await res.json();
        setProviders(data ?? {});
      }
    };
    void loadProviders();
  }, []);

  const showCredentials =
    providers.credentials !== undefined || Object.keys(providers).length === 0;
  const showGoogle = Boolean(providers.google);
  const showGithub = Boolean(providers.github);

  return (
    <div className="relative min-h-screen overflow-hidden bg-white">
      <div className="absolute inset-0">
        <div className="absolute left-[-20%] top-[-20%] h-96 w-96 rounded-full bg-[#2323eb]/10 blur-[160px]" />
        <div className="absolute bottom-[-20%] right-[-10%] h-80 w-80 rounded-full bg-slate-200/60 blur-[140px]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.9),rgba(255,255,255,0.95))]" />
      </div>

      <div className="relative mx-auto flex min-h-screen max-w-6xl items-center justify-center px-4 py-12">
        <div className="grid w-full max-w-4xl gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-5 text-slate-900 pt-15">
            <Image
              src="/logo_holoplax.png"
              alt="Holoplax logo"
              width={240}
              height={72}
              className="h-auto"
              style={{ width: "14rem", height: "auto" }}
              priority
            />
            <h1 className="text-4xl font-semibold leading-tight">
              スプリントの流れを
              <br />
              人生に導入する。
            </h1>
            <p className="text-sm text-slate-600">
              Backlog・Sprint・AI提案をあなた専用の空間に。チーム化の拡張も見据えた設計です。
            </p>
          </div>

          <div className="border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">
                {mode === "signup" ? "新規登録" : "ログイン"}
              </h2>
              <Link
                href="/"
                className="text-xs text-slate-500 hover:text-slate-900"
              >
                ダッシュボードへ
              </Link>
            </div>

            <div className="mt-6 space-y-4">
              <div className="flex border border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setMode("login");
                    setError(null);
                  }}
                  className={`w-1/2 px-3 py-2 text-xs font-semibold ${mode === "login"
                    ? "bg-[#2323eb] text-white"
                    : "bg-white text-slate-600"
                    }`}
                >
                  ログイン
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode("signup");
                    setError(null);
                  }}
                  className={`w-1/2 px-3 py-2 text-xs font-semibold ${mode === "signup"
                    ? "bg-[#2323eb] text-white"
                    : "bg-white text-slate-600"
                    }`}
                >
                  新規登録
                </button>
              </div>

              {showCredentials ? (
                <form
                  onSubmit={async (event) => {
                    event.preventDefault();
                    setError(null);
                    setLoading(true);
                    if (mode === "signup") {
                      const res = await fetch("/api/auth/register", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ email, password, name }),
                      });
                      if (!res.ok) {
                        const data = await res.json().catch(() => ({}));
                        setError(data.error ?? "登録に失敗しました");
                        setLoading(false);
                        return;
                      }
                    }
                    const result = await signIn("credentials", {
                      email,
                      password,
                      callbackUrl: "/",
                      redirect: false,
                    });
                    if (result?.error) {
                      setError(
                        "ログインに失敗しました。認証情報を確認してください。",
                      );
                      setLoading(false);
                      return;
                    }
                    if (result?.url) {
                      window.location.href = result.url;
                    }
                    setLoading(false);
                  }}
                  className="space-y-3"
                >
                  {mode === "signup" ? (
                    <>
                      <label className="text-xs text-slate-500">
                        名前（任意）
                      </label>
                      <div className="flex items-center gap-2 border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">
                        <User size={16} className="text-slate-400" />
                        <input
                          value={name}
                          onChange={(event) => setName(event.target.value)}
                          type="text"
                          placeholder="名前"
                          className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
                        />
                      </div>
                    </>
                  ) : null}
                  <label className="text-xs text-slate-500">メール</label>
                  <div className="flex items-center gap-2 border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">
                    <Mail size={16} className="text-slate-400" />
                    <input
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      type="email"
                      placeholder="you@example.com"
                      className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
                    />
                  </div>
                  <label className="text-xs text-slate-500">パスワード</label>
                  <div className="flex items-center gap-2 border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">
                    <Lock size={16} className="text-slate-400" />
                    <input
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      type="password"
                      placeholder="••••••••"
                      className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
                    />
                  </div>
                  {error ? (
                    <div className="border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                      {error}
                    </div>
                  ) : null}
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>
                      {mode === "signup"
                        ? "登録後にメール確認が必要です。"
                        : ""}
                    </span>
                    <Link href="/auth/forgot" className="hover:text-[#2323eb]">
                      パスワードを忘れた
                    </Link>
                  </div>
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-[#2323eb] py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:shadow-md hover:shadow-[#2323eb]/20 disabled:opacity-60"
                  >
                    {loading
                      ? "処理中..."
                      : mode === "signup"
                        ? "登録して続行"
                        : "ログイン"}
                  </button>
                </form>
              ) : null}

              {(showGoogle || showGithub) && (
                <div className="space-y-3">
                  <p className="text-xs text-slate-500">他の方法で続行</p>
                  <div className="flex items-center gap-3">
                    {showGoogle ? (
                      <button
                        type="button"
                        onClick={() => signIn("google", { callbackUrl: "/" })}
                        aria-label="Googleでログイン"
                        className="flex h-11 w-11 items-center justify-center border border-slate-200 bg-white text-slate-700 transition hover:-translate-y-0.5 hover:border-[#2323eb]/40 hover:text-[#2323eb]"
                      >
                        <Chrome size={18} />
                      </button>
                    ) : null}
                    {showGithub ? (
                      <button
                        type="button"
                        onClick={() => signIn("github", { callbackUrl: "/" })}
                        aria-label="GitHubでログイン"
                        className="flex h-11 w-11 items-center justify-center border border-slate-200 bg-white text-slate-700 transition hover:-translate-y-0.5 hover:border-[#2323eb]/40 hover:text-[#2323eb]"
                      >
                        <Github size={18} />
                      </button>
                    ) : null}
                  </div>
                </div>
              )}
            </div>

            <p className="mt-6 text-xs text-slate-500">
              ログインすることで利用規約とプライバシーポリシーに同意したものとみなします。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
