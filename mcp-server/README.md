# Holoplax MCP サーバー

タスク・スプリント・インテーク・AI操作を MCP クライアントへ公開する別プロセス。
Web と同じ application service と入力契約を使う。

## 起動

[ルートの開発準備](../README.md#開発) を済ませ、リポジトリ直下で実行する。

```bash
npm run build:mcp
MCP_TRANSPORT=http node --env-file=.env mcp-server/dist/index.js
```

通常の `npm start --workspace mcp-server` は `.env` を読み込まないので、
環境変数をプロセスへ渡す。HTTP の既定ポートは `3001`、DB確認は `GET /health`。
Docker は `docker build --target mcp -t holoplax-mcp .`。

| 環境変数 | 用途 |
| --- | --- |
| `DATABASE_URL` | 全モードで必須 |
| `MCP_TRANSPORT` | `stdio`（既定）または `http` |
| `MCP_PORT` | HTTP ポート（既定 `3001`） |
| `MCP_USER_ID` / `MCP_WORKSPACE_ID` | stdio で必須。実行者と対象を固定 |
| `ENCRYPTION_KEY` | DB に保存した AI 認証情報を復号する場合に必要 |
| `AUTH_SECRET`（旧 `NEXTAUTH_SECRET`） | 旧 JWT 認証を使う場合に必要 |

## 接続

HTTP は Web の設定画面で発行した `mcp_` API キー（発行時だけ表示）を使う。
キーの workspace、所属、期限、失効、ユーザー停止を確認する。
クライアントの接続設定例:

```json
{
  "mcpServers": {
    "holoplax": {
      "url": "https://<mcp-host>/mcp",
      "headers": { "Authorization": "Bearer mcp_<key>" }
    }
  }
}
```

ローカル stdio は信頼できる実行環境で使い、プロセスの固定 ID で操作する。
パスと ID を実際の値に置き換える。

```json
{
  "mcpServers": {
    "holoplax": {
      "command": "node",
      "args": ["/absolute/path/holoplax/mcp-server/dist/index.js"],
      "env": {
        "DATABASE_URL": "postgresql://<user>:<password>@localhost:5433/holoplax",
        "MCP_TRANSPORT": "stdio",
        "MCP_USER_ID": "<user-id>",
        "MCP_WORKSPACE_ID": "<workspace-id>"
      }
    }
  }
}
```

公開ツール名・入力はクライアントの `tools/list` を正本とする。
[tools/index.ts](src/tools/index.ts) が実行用 Zod schema から公開契約を生成するため、
この文書では個々の引数を複製しない。設定は [config.ts](src/config.ts)、認証は [auth.ts](src/auth.ts) を参照。
