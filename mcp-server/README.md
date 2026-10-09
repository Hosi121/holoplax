# Holoplax MCP

Webと同じWorkerの `/mcp` で、タスク・スプリント・インテーク・AI操作を公開する。
設定画面で発行したAPIキーを使い、各リクエストで失効・期限・所属・ユーザー停止を確認する。

```json
{
  "mcpServers": {
    "holoplax": {
      "url": "https://<app-host>/mcp",
      "headers": { "Authorization": "Bearer mcp_<key>" }
    }
  }
}
```

stdioクライアントにはHTTPへのブリッジを使う。DB接続情報や固定のユーザーIDは不要。

```bash
npm run build:mcp
MCP_API_KEY=mcp_<key> MCP_URL=http://localhost:3000/mcp node mcp-server/dist/index.js
```

クライアント設定のcommandは `node`、argsは `mcp-server/dist/index.js` の絶対パス、
envは `MCP_API_KEY` と `MCP_URL` を指定する。
公開ツール名・入力は `tools/list` が正本。
[tools](src/tools/index.ts) が実行用Zod schemaから公開契約を生成する。
