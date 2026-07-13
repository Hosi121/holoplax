"use client";

import { Chrome, Github } from "lucide-react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";
import { Suspense, useEffect, useRef } from "react";
import { useToast } from "../components/toast";
import { ConfirmDialog } from "../components/ui/confirm-dialog";
import { useWorkspaceId } from "../components/use-workspace-id";
import { McpKeysSection } from "./components/mcp-keys-section";
import { MemorySettingsSection } from "./components/memory-settings-section";
import { useAccount } from "./hooks/use-account";
import { useThresholds } from "./hooks/use-thresholds";

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsContent />
    </Suspense>
  );
}

function SettingsContent() {
  const { update } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { workspaceId, ready } = useWorkspaceId();
  const toast = useToast();
  const errorHandled = useRef(false);

  useEffect(() => {
    const error = searchParams.get("error");
    if (error && !errorHandled.current) {
      errorHandled.current = true;
      if (error === "OAuthAccountNotLinked") {
        toast.error("このメールアドレスは既に別のユーザーに登録されています。");
      } else {
        toast.error(`連携に失敗しました: ${error}`);
      }
      router.replace("/settings");
    }
  }, [searchParams, router, toast]);

  const {
    account,
    accountDirty,
    linkedProviders,
    unlinking,
    fetchAccount,
    updateAccountField,
    saveAccount,
    uploadAvatar,
    unlinkProvider,
  } = useAccount({
    onSessionUpdate: async (user) => {
      await update({ user });
    },
    onRouterRefresh: () => router.refresh(),
    onError: toast.error,
    onSuccess: toast.success,
  });

  const { low, high, dirty, fetchThresholds, updateLow, updateHigh, saveThresholds } =
    useThresholds({ ready, workspaceId, onError: toast.error });
  useEffect(() => {
    void fetchThresholds();
    void fetchAccount();
  }, [fetchThresholds, fetchAccount]);

  const handleSaveThresholds = async () => {
    if (await saveThresholds()) {
      toast.success("AI自動化の境界値を保存しました。");
    } else {
      toast.error("AI自動化の境界値を保存できませんでした。");
    }
  };

  return (
    <main className="max-w-6xl flex-1 space-y-6 px-4 py-10 lg:ml-60 lg:px-6 lg:py-14">
      <header className="border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <p className="text-xs uppercase text-slate-500">Settings</p>
            <h1 className="text-3xl font-semibold text-slate-900">設定</h1>
            <p className="text-sm text-slate-600">
              アカウント、AI自動化、AIが覚えている情報を管理します。
            </p>
          </div>
        </div>
      </header>

      <section className="grid gap-4 lg:grid-cols-2">
        <div id="account" className="border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900">アカウント</h3>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="grid gap-1 text-xs text-slate-500">
              名前
              <input
                value={account.name}
                onChange={(e) => updateAccountField("name", e.target.value)}
                className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
                placeholder="名前"
              />
            </label>
            <label className="grid gap-1 text-xs text-slate-500">
              メール
              <input
                value={account.email}
                onChange={(e) => updateAccountField("email", e.target.value)}
                className="w-full border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
                placeholder="you@example.com"
              />
            </label>
          </div>
          <div className="mt-4 flex items-center gap-4">
            <div className="size-12 border border-slate-200 bg-slate-100">
              {account.image ? (
                <Image
                  src={account.image}
                  alt="avatar"
                  width={48}
                  height={48}
                  unoptimized
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
                  await uploadAvatar(file);
                }}
                className="mt-2 block text-xs text-slate-600 file:mr-3 file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-slate-700"
              />
            </label>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={saveAccount}
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

        <div className="border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
          <h3 className="text-lg font-semibold text-slate-900">外部アカウント連携</h3>
          <p className="text-sm text-slate-600">
            Google・GitHubアカウントと連携してログインできるようにします。
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="flex items-center justify-between border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex items-center gap-3">
                <Chrome size={20} className="text-slate-600" />
                <div>
                  <p className="text-sm font-medium text-slate-900">Google</p>
                  <p className="text-xs text-slate-500">
                    {linkedProviders.includes("google") ? "連携済み" : "未連携"}
                  </p>
                </div>
              </div>
              {linkedProviders.includes("google") ? (
                <ConfirmDialog
                  title="Googleとの連携を解除しますか？"
                  description="別のログイン方法を利用できることを確認してから解除してください。"
                  confirmLabel="連携を解除"
                  onConfirm={() => unlinkProvider("google")}
                  trigger={
                    <button
                      type="button"
                      disabled={unlinking === "google"}
                      className="border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 hover:border-red-300 hover:text-red-600 disabled:opacity-50"
                    >
                      {unlinking === "google" ? "解除中..." : "連携解除"}
                    </button>
                  }
                />
              ) : (
                <button
                  onClick={() => signIn("google", { callbackUrl: "/settings" })}
                  className="border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 transition hover:border-[#2323eb]/60 hover:text-[#2323eb]"
                >
                  連携する
                </button>
              )}
            </div>
            <div className="flex items-center justify-between border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex items-center gap-3">
                <Github size={20} className="text-slate-600" />
                <div>
                  <p className="text-sm font-medium text-slate-900">GitHub</p>
                  <p className="text-xs text-slate-500">
                    {linkedProviders.includes("github") ? "連携済み" : "未連携"}
                  </p>
                </div>
              </div>
              {linkedProviders.includes("github") ? (
                <ConfirmDialog
                  title="GitHubとの連携を解除しますか？"
                  description="別のログイン方法を利用できることを確認してから解除してください。"
                  confirmLabel="連携を解除"
                  onConfirm={() => unlinkProvider("github")}
                  trigger={
                    <button
                      type="button"
                      disabled={unlinking === "github"}
                      className="border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 hover:border-red-300 hover:text-red-600 disabled:opacity-50"
                    >
                      {unlinking === "github" ? "解除中..." : "連携解除"}
                    </button>
                  }
                />
              ) : (
                <button
                  onClick={() => signIn("github", { callbackUrl: "/settings" })}
                  className="border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 transition hover:border-[#2323eb]/60 hover:text-[#2323eb]"
                >
                  連携する
                </button>
              )}
            </div>
          </div>
        </div>

        <McpKeysSection ready={ready} workspaceId={workspaceId} />

        <div className="border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">AI自動化の境界値</h3>
          <p className="text-sm text-slate-600">
            AIに任せる範囲と、分割を提案する範囲を設定します（現在: {low} / {high}）。
          </p>
          <div className="mt-3 flex items-center gap-2 text-sm">
            <input
              type="number"
              value={low}
              onChange={(e) => updateLow(Number(e.target.value) || 0)}
              className="w-20 border border-slate-200 px-3 py-2 text-slate-800 outline-none focus:border-[#2323eb]"
            />
            <input
              type="number"
              value={high}
              onChange={(e) => updateHigh(Number(e.target.value) || 0)}
              className="w-20 border border-slate-200 px-3 py-2 text-slate-800 outline-none focus:border-[#2323eb]"
            />
            <button
              onClick={() => void handleSaveThresholds()}
              disabled={!dirty}
              className="border border-slate-200 bg-slate-50 px-4 py-2 text-slate-700 transition hover:border-[#2323eb]/60 hover:text-[#2323eb] disabled:opacity-50"
            >
              保存
            </button>
          </div>
        </div>

        <MemorySettingsSection ready={ready} workspaceId={workspaceId} />
      </section>
    </main>
  );
}
