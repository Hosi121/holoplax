# Discord Bot Integration (task intake)

## 概要
- `/holotask` スラッシュコマンドで入力したテキストを Holoplax にタスクとして登録する。
- 認証は共有トークンで行い、Next.js 側の `/api/integrations/discord` が受ける。

## 必要な環境変数
- `DISCORD_BOT_TOKEN`：Bot トークン
- `DISCORD_CLIENT_ID`：Bot のクライアントID
- `DISCORD_GUILD_ID`：コマンドを登録するサーバID
- `DISCORD_INTEGRATION_TOKEN`：共有トークン（Next/API と Bot で一致させる）
- `DISCORD_INTEGRATION_URL`：API URL（例: http://localhost:3000/api/integrations/discord）
- `DISCORD_USER_ID` または `INTEGRATION_USER_ID`：タスクの作成ユーザー
- `DISCORD_WORKSPACE_ID`：タスクを入れるワークスペース（未指定時はユーザーのデフォルトを解決）

`.env.example` に追記済み。

## Next.js 側のエンドポイント
- `app/api/integrations/discord/route.ts`
- ヘッダ `Authorization: Bearer <DISCORD_INTEGRATION_TOKEN>` または `x-integration-token` で認証。
- body: `{ title, description?, points?, urgency?, risk? }`
- 生成タスクは BACKLOG に入り、自動化ロジックが有効なら適用される。

## Bot の実行
1. 依存追加（ネットワークが使える環境で実行）  
   `npm install discord.js`
2. スラッシュコマンド登録＋Bot起動  
   `node scripts/discord-bot.js`
   - `/holotask text:"タイトル | 説明 | ポイント"` 形式で投稿。
   - 例: `/holotask text:"Landingページ改善 | ファーストビュー修正 | 3"`

## 注意
- ネットワーク遮断環境では `npm install` が失敗するので、外部で `discord.js` を取得するかキャッシュを用意してください。
- 共有トークンは十分長いランダム文字列にすること。
