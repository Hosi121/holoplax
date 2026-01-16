# Slack Integration (slash command / bot)

## 概要
- Slack から `/holotask` で Holoplax にタスクを作成する。
- 2パターン:
  - Slash Command を Next.js エンドポイント `/api/integrations/slack` に直接向ける
  - Bolt ベースのローカル Bot (`scripts/slack-bot.js`) を起動し、そこからAPIに中継する

## 環境変数
- `SLACK_SIGNING_SECRET`（必須）: Slash Command 署名検証用
- `SLACK_BOT_TOKEN`（Botを動かす場合に必須）
- `SLACK_APP_TOKEN`（Socket ModeでBotを動かす場合に使用）
- `SLACK_INTEGRATION_URL`（任意）: Botが投稿先に使うURL。未設定なら `DISCORD_INTEGRATION_URL` を流用
- `SLACK_USER_ID` or `INTEGRATION_USER_ID`: タスク作成ユーザー
- `SLACK_WORKSPACE_ID`: タスクを入れるワークスペース（未設定ならユーザーから解決を試行）
- 共有トークン: `DISCORD_INTEGRATION_TOKEN`（Bot経由投稿時に利用）

`.env.example` に Slack項目を追記済み。

## Slash Command を直接使う場合
1. Slack App の Slash Command を `https://<host>/api/integrations/slack` に向ける。メソッドは POST。
2. Request signing を有効にし、`SLACK_SIGNING_SECRET` を環境変数で設定。
3. コマンド例: `/holotask タイトル | 説明 | 3`
   - `|` 区切りでポイント（任意）を付けられる。
4. レスポンスは in_channel テキストでタスクIDとworkspaceを返す。

## Bot（Bolt）で動かす場合
1. 依存インストール（ネットワーク環境で実行）  
   `npm install @slack/bolt`
2. `.env` に `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `DISCORD_INTEGRATION_TOKEN`, `SLACK_INTEGRATION_URL` を設定。
3. 起動: `node scripts/slack-bot.js`（Socket Modeの場合は `SLACK_APP_TOKEN` も設定）
4. Slackの `/holotask` コマンドがBotに届き、Holoplax APIへ中継してタスク作成。

## 備考
- エンドポイントは署名検証（5分以内タイムスキュー）で保護しているため、シークレット未設定だと拒否される。
- Bot経由は共有トークンによる認可を使うため、十分な長さのランダム文字列を `DISCORD_INTEGRATION_TOKEN` に設定すること。
