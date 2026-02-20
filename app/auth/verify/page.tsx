"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";

function VerifyContent() {
  const params = useSearchParams();
  const token = params.get("token");
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");

  useEffect(() => {
    const verify = async () => {
      if (!token) {
        setStatus("error");
        return;
      }
      const res = await apiFetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      setStatus(res.ok ? "success" : "error");
    };
    void verify();
  }, [token]);

  return (
    <div className="border border-slate-200 bg-white p-8 text-center shadow-sm">
      <h1 className="text-2xl font-semibold text-slate-900">メール認証</h1>
      <p className="mt-3 text-sm text-slate-600">
        {status === "loading" && "認証を確認しています..."}
        {status === "success" && "メール認証が完了しました。"}
        {status === "error" && "認証リンクが無効か期限切れです。"}
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

export default function VerifyPage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-3xl items-center justify-center px-4">
      <Suspense fallback={<div>Loading...</div>}>
        <VerifyContent />
      </Suspense>
    </div>
  );
}
