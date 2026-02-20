"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { apiFetch } from "@/lib/api-client";

function ResetPasswordForm() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

  return (
    <div className="border border-slate-200 bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-semibold text-slate-900">新しいパスワード</h1>
      <p className="mt-2 text-sm text-slate-600">新しいパスワードを入力してください。</p>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const res = await apiFetch("/api/auth/reset", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token, password }),
          });
          setStatus(res.ok ? "success" : "error");
        }}
        className="mt-4 space-y-3"
      >
        <input
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          type="password"
          placeholder="新しいパスワード"
          className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
        />
        <button
          type="submit"
          className="w-full bg-[#2323eb] py-2 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:shadow-md hover:shadow-[#2323eb]/20"
        >
          再設定する
        </button>
      </form>
      <p className="mt-3 text-xs text-slate-600">
        {status === "success" && "パスワードを更新しました。"}
        {status === "error" && "再設定に失敗しました。リンクを確認してください。"}
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
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-3xl items-center justify-center px-4">
      <Suspense fallback={<div>Loading...</div>}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
