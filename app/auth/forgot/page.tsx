"use client";

import Link from "next/link";
import { useState } from "react";
import { apiFetch } from "@/lib/api-client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sent" | "error">("idle");

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl items-center justify-center px-4">
      <div className="border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">パスワード再設定</h1>
        <p className="mt-2 text-sm text-slate-600">
          登録メールアドレスに再設定リンクを送信します。
        </p>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const res = await apiFetch("/api/auth/request-reset", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ email }),
            });
            setStatus(res.ok ? "sent" : "error");
          }}
          className="mt-4 space-y-3"
        >
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            placeholder="you@example.com"
            className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
          />
          <button
            type="submit"
            className="w-full bg-[#2323eb] py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:shadow-md hover:shadow-[#2323eb]/20"
          >
            送信する
          </button>
        </form>
        <p className="mt-3 text-xs text-slate-600">
          {status === "sent" && "送信しました。メールをご確認ください。"}
          {status === "error" && "送信に失敗しました。設定を確認してください。"}
        </p>
        <div className="mt-6">
          <Link
            href="/auth/signin"
            className="border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700 transition hover:border-[#2323eb]/60 hover:text-[#2323eb]"
          >
            ログインへ
          </Link>
        </div>
      </div>
    </div>
  );
}
