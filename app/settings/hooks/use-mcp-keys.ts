import { useCallback, useState } from "react";
import { apiFetch } from "@/lib/api-client";

export type McpKeyRow = {
  id: string;
  name: string;
  keyPrefix: string;
  workspaceId: string;
  workspace: { name: string };
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
};

export function useMcpKeys(params: {
  ready: boolean;
  workspaceId: string | null;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}) {
  const { ready, workspaceId, onError, onSuccess } = params;
  const [keys, setKeys] = useState<McpKeyRow[]>([]);
  const [name, setName] = useState("Codex");
  const [fullKey, setFullKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchKeys = useCallback(async () => {
    if (!ready || !workspaceId) {
      setKeys([]);
      return;
    }
    const response = await apiFetch("/api/mcp/keys");
    if (!response.ok) {
      onError("MCP接続キーを読み込めませんでした。");
      return;
    }
    const data = await response.json();
    setKeys(data.keys ?? []);
  }, [ready, workspaceId, onError]);

  const createKey = async () => {
    if (!workspaceId || !name.trim()) return;
    setLoading(true);
    try {
      const response = await apiFetch("/api/mcp/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), workspaceId }),
      });
      if (!response.ok) {
        onError("MCP接続キーを作成できませんでした。");
        return;
      }
      const data = await response.json();
      setFullKey(data.key);
      onSuccess("MCP接続キーを作成しました。この画面で一度だけ表示されます。");
      await fetchKeys();
    } finally {
      setLoading(false);
    }
  };

  const revokeKey = async (id: string) => {
    const response = await apiFetch(`/api/mcp/keys?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      onError("MCP接続キーを無効にできませんでした。");
      return;
    }
    setKeys((current) => current.filter((key) => key.id !== id));
    onSuccess("MCP接続キーを無効にしました。");
  };

  return {
    keys,
    name,
    setName,
    fullKey,
    setFullKey,
    loading,
    fetchKeys,
    createKey,
    revokeKey,
  };
}
