# 開発日誌 (2026-01-16)

## 進捗概要
- Prisma導入し、Postgres永続化前提のスキーマを追加（`prisma/schema.prisma`）。
- Prismaクライアント初期化（`lib/prisma.ts`）、共通型（`lib/types.ts`）を定義。
- APIをDB対応に置き換え：
  - `/api/tasks`, `/api/tasks/[id]`：Task CRUD（status=BACKLOG/SPRINT/DONE）。
  - `/api/velocity`：VelocityEntry CRUD。
  - `/api/automation`：しきい値の取得/更新（AutomationSetting）。
  - `/api/ai/suggest`：OpenAI API呼び出し（キー未設定時はダミー）。
- フロント改善：
  - バックログ：右上ボタン→モーダルで追加、API経由で保存/取得、AI提案表示。
  - スプリント：APIからタスク取得、追加/完了をAPI経由で更新、残りキャパ表示。
  - ベロシティ：APIから履歴取得、追加をAPI経由で登録。
  - 自動化/設定：しきい値をAPI経由で更新、即時反映。設定画面も同様。
  - サイドバー：ページリンクとアクティブ表示を `usePathname` で実装。
- docker-compose：Postgresホスト公開を5433に変更（コンテナ内5432）。MinIO稼働。
- Prisma migrate：compose内で `npx prisma migrate dev --name init` 実行、`prisma/migrations` 生成済み（DB初期化済み）。

## 未解決/懸念
- 現ディレクトリの `.git` が読み取り専用で `git add/commit` 不可。tmpfile削除などもステージできない。新規クローンで作業を続行する必要あり。
- リモートにはpush済み（ユーザーがpush済み）。作業継続には新しいクローンを使用。
- Prisma CLI バージョン混在はコンテナ内で `npm install` + `apk add openssl` で解決し、マイグレーション適用済み。

## 再開手順メモ
1. 新規クローン（例: `/home/takuya/holoplax-fresh`）。現ディレクトリはread-onlyのため撤去/再クローン推奨。
2. `.env` 作成: `cp .env.example .env`（DATABASE_URL はホストから `localhost:5433`）。
3. `docker compose up -d db minio`
4. `DATABASE_URL=postgresql://holoplax:holoplax@localhost:5433/holoplax npx prisma migrate dev --name init`
5. `npm run dev` で起動。OpenAI利用時は `OPENAI_API_KEY` を `.env` にセット。

## 次にやること
- `.git` read-only問題解消（新クローン推奨）。
- バックログ/スプリント/ベロシティ/自動化/設定のAPI動作を実DBで再テスト。
- OpenAI提案を実キーで検証。
