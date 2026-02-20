"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";

function InviteContent() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");

  useEffect(() => {
    const accept = async () => {
      if (!token) {
        setStatus("error");
        return;
      }
      const res = await apiFetch("/api/workspaces/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      setStatus(res.ok ? "success" : "error");
    };
    void accept();
  }, [token]);

  return (
    <div className="border border-slate-200 bg-white p-8 text-center shadow-sm">
      <h1 className="text-2xl font-semibold text-slate-900">招待を受け取る</h1>
      <p className="mt-3 text-sm text-slate-600">
        {status === "loading" && "招待を処理しています..."}
        {status === "success" && "ワークスペースに参加しました。"}
        {status === "error" && "招待が無効か期限切れです。"}
      </p>
      <div className="mt-6">
        <Link
          href="/workspaces"
          className="border border-slate-200 bg-slate-50 px-4 py-2 text-sm text-slate-700 transition hover:border-[#2323eb]/60 hover:text-[#2323eb]"
        >
          ワークスペースへ
        </Link>
      </div>
    </div>
  );
}

export default function WorkspaceInvitePage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-3xl items-center justify-center px-4">
      <Suspense fallback={<div>Loading...</div>}>
        <InviteContent />
      </Suspense>
    </div>
  );
}
