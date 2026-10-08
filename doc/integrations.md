# Discord / Slack 連携

チャットから Task を作る、またはインテークへ取り込む。
入力項目は [共通契約](../lib/contracts/integrations.ts)、API は [integration routes](../server/routes/integrations) を正本とする。

## Bot の準備

Bot を使う場合だけ、リポジトリ直下で依存を追加してインストールする。
Web / MCP の依存も含め、npm ci による削除を避ける。

```bash
npm ci --workspace server --workspace mcp-server --workspace bots --include-workspace-root
```

Bot コマンドはルートの `.env` を読む。連携先が別ホストなら各 URL を変更する。
API の実行者は対象 workspace のメンバーである必要がある。

## Discord

監視チャンネル・スレッドのメッセージを AI で抽出してインテークへ送り、
`/task` は直接 Task を作る。`/tasks` は一覧画面へのリンクを返す。

| 設定先 | 環境変数 |
| --- | --- |
| Bot | `DISCORD_BOT_TOKEN`、`OPENAI_API_KEY`（起動時に必須） |
| Bot の監視対象 | `DISCORD_WATCH_CHANNEL_IDS`（カンマ区切り。旧単一形 `DISCORD_WATCH_CHANNEL_ID` も可） |
| Bot と API | 同じ `DISCORD_INTEGRATION_TOKEN`。HMAC を使う場合は同じ `DISCORD_SIGNING_SECRET` も設定 |
| API の実行者 | `DISCORD_USER_ID`（代替 `INTEGRATION_USER_ID`） |
| Task API の対象 | `DISCORD_WORKSPACE_ID`（代替 `INTEGRATION_WORKSPACE_ID`） |
| コマンド登録 | `DISCORD_CLIENT_ID`、`DISCORD_GUILD_ID`（guild 登録時） |

インテークの送信先は `DISCORD_INTEGRATION_URL`（既定 `/api/integrations/discord`）、
Task の送信先は `DISCORD_TASK_URL`（既定 `/api/integrations/discord/task`）。
既定ホストは `http://localhost:3000`。インテークの workspace は実行者から解決する。
Bot には Message Content Intent と監視対象を読める権限を与える。

```bash
npm run discord:deploy              # guild 内に登録
# npm run discord:deploy -- --global  # 全体登録を選ぶ場合
npm run bot:discord
```

挙動は [Discord Bot](../bots/discord-bot.js) と [登録処理](../bots/deploy-discord-commands.js) を参照。

## Slack

### Web API へ直接送る

Slash Command `/holotask` の Request URL を `https://<web-host>/api/integrations/slack` にする。
Web 側に `SLACK_SIGNING_SECRET`、`SLACK_USER_ID`（代替 `INTEGRATION_USER_ID`）、
`SLACK_WORKSPACE_ID` を設定する。署名と timestamp を検証する。
入力例: `/holotask タイトル | 説明 | 3`。Bot の依存は不要。

### Bolt Bot を使う

[Slack Bot](../bots/slack-bot.js) に `SLACK_BOT_TOKEN` / `SLACK_SIGNING_SECRET` を設定する。
`SLACK_APP_TOKEN` があれば Socket Mode、なければ HTTP で受け付ける。

送信先 `SLACK_TASK_URL` は既定で **`/api/integrations/discord/task`** を使う。
API 側には Discord Task API と同じ token・実行者・workspace 設定が必要。
Bot 側の `SLACK_INTEGRATION_TOKEN`（代替 `DISCORD_INTEGRATION_TOKEN`）を API 側の
`DISCORD_INTEGRATION_TOKEN` に合わせる。HMAC を使う場合は双方に
`DISCORD_SIGNING_SECRET` を設定する（Bot は `INTEGRATION_SIGNING_SECRET` も受け付ける）。

```bash
PORT=3002 npm run bot:slack
```

既定ポート `3001` は MCP と重なるため、同時起動時は上記のように変更する。
HTTP モードでは Slack の Request URL を Bot の `/slack/events` に向ける。
