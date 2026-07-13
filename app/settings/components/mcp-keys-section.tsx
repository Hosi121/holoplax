"use client";

import { KeyRound } from "lucide-react";
import { useEffect } from "react";
import { useToast } from "../../components/toast";
import { ConfirmDialog } from "../../components/ui/confirm-dialog";
import { useMcpKeys } from "../hooks/use-mcp-keys";

type McpKeysSectionProps = {
  ready: boolean;
  workspaceId: string | null;
};

export function McpKeysSection({ ready, workspaceId }: McpKeysSectionProps) {
  const toast = useToast();
  const { keys, name, setName, fullKey, setFullKey, loading, fetchKeys, createKey, revokeKey } =
    useMcpKeys({
      ready,
      workspaceId,
      onError: toast.error,
      onSuccess: toast.success,
    });

  useEffect(() => {
    void fetchKeys();
  }, [fetchKeys]);

  return (
    <div className="border border-slate-200 bg-white p-6 shadow-sm lg:col-span-2">
      <div className="flex items-start gap-3">
        <KeyRound size={20} className="mt-0.5 text-slate-500" />
        <div>
          <h3 className="text-lg font-semibold text-slate-900">MCP接続キー</h3>
          <p className="text-sm text-slate-600">
            CodexやClaudeなどから、このワークスペースを安全に操作するためのキーです。
          </p>
        </div>
      </div>
      {fullKey ? (
        <div className="mt-4 border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-semibold text-amber-900">このキーは一度だけ表示されます</p>
          <code className="mt-2 block break-all bg-white p-3 text-xs text-slate-800">
            {fullKey}
          </code>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(fullKey);
                toast.success("キーをコピーしました。");
              }}
              className="border border-amber-300 bg-white px-3 py-1 text-xs text-amber-900"
            >
              コピー
            </button>
            <button
              type="button"
              onClick={() => setFullKey(null)}
              className="border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700"
            >
              閉じる
            </button>
          </div>
        </div>
      ) : null}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={100}
          aria-label="接続キーの名前"
          className="min-w-0 flex-1 border border-slate-200 px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#2323eb]"
          placeholder="例: 自宅のCodex"
        />
        <button
          type="button"
          disabled={!workspaceId || !name.trim() || loading}
          onClick={() => void createKey()}
          className="bg-[#2323eb] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {loading ? "作成中..." : "接続キーを作成"}
        </button>
      </div>
      <div className="mt-4 grid gap-2">
        {keys.length ? (
          keys.map((key) => (
            <div
              key={key.id}
              className="flex flex-col justify-between gap-3 border border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center"
            >
              <div>
                <p className="text-sm font-semibold text-slate-900">{key.name}</p>
                <p className="text-xs text-slate-500">
                  {key.keyPrefix} ・ {key.workspace.name} ・ 最終利用{" "}
                  {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleString("ja-JP") : "未使用"}
                </p>
              </div>
              <ConfirmDialog
                title={`${key.name} を無効にしますか？`}
                description="このキーを使っているMCPクライアントは接続できなくなります。"
                confirmLabel="無効にする"
                onConfirm={() => revokeKey(key.id)}
                trigger={
                  <button
                    type="button"
                    className="border border-rose-200 bg-white px-3 py-1 text-xs text-rose-700"
                  >
                    無効にする
                  </button>
                }
              />
            </div>
          ))
        ) : (
          <p className="text-xs text-slate-500">有効な接続キーはありません。</p>
        )}
      </div>
    </div>
  );
}
