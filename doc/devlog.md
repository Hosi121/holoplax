# 開発日誌 (2026-01-16)

## 進捗概要
- Docker構成をDB/MinIO専用に整理（Nextはホスト起動）。`docker-compose.yml`
- Taskに説明カラムを追加し、API/フロント対応。`prisma/schema.prisma`, `app/api/tasks/*`, `app/backlog/page.tsx`, `app/sprint/page.tsx`
- Task CRUDはPATCH/DELETE対応済み（編集/削除UI実装）。
- AI機能を拡張：
  - `/api/ai/score`：スコア/ポイント推定（OpenAI or ヒューリスティック）。
  - `/api/ai/split`：分解提案（OpenAI or ヒューリスティック）。
  - `/api/ai/logs`：AI提案ログの取得。
  - `/api/ai/suggest` はログ保存対応。
- バックログで「AIスコア推定」「分解提案→一括追加」を実装。分解確定時は元タスク削除。
- 設定画面にAI提案ログを表示。
- マイグレーション追加: `add_task_description`, `add_ai_suggestion_log`, `cascade_ai_suggestions`。
- シードスクリプト追加（仮想データ/AIログ）。`scripts/seed-dev.mjs`
- NextAuth導入の下地を追加（Email/Google/GitHub対応、ユーザー分離前提のスキーマ）。`lib/auth.ts`, `app/api/auth/[...nextauth]/route.ts`, `prisma/schema.prisma`
- Task/Velocity/Automation/AIログはユーザーIDで分離（APIに認証必須）。`app/api/*`
- 管理者ロールとパスワード認証を追加（Credentials）。管理者は全データ参照可能。`lib/auth.ts`, `app/api/*`, `prisma/schema.prisma`

## 未実装/未接続の機能
- NextAuth のUI（ログイン導線/認証画面）は未整備。
- 自動化ルールは画面のみで、実際の自動処理ロジックは未接続。
- スプリント開始/終了の状態管理は未実装（ボタンはUIのみ）。
- 通知/ストレージ設定はUIのみ（MinIOの実利用や設定更新は未実装）。
- インボックス連携（メモ/カレンダー/メール/チャット）は未実装。
- AIスコア推定は手動トリガーのみ（作成時の自動推定・保存は未実装）。
 - チーム/ワークスペースの実機能は未実装（スキーマのみ準備）。

## 技術メモ
- `.env` に `OPENAI_API_KEY` を入れるとAIエンドポイントが実呼び出しになる。
- AIログは `AiSuggestion` テーブルに保存。Task削除時はCascadeで削除。

## 再開手順メモ
1. `.env` 作成: `cp .env.example .env`（DATABASE_URL はホストから `localhost:5433`）。
2. `docker compose up -d db minio`
3. `DATABASE_URL=postgresql://holoplax:holoplax@localhost:5433/holoplax npx prisma migrate dev`
4. `node scripts/seed-dev.mjs`（必要なら仮想データ投入）
5. `npm run dev` で起動。OpenAI利用時は `OPENAI_API_KEY` を `.env` にセット。
6. NextAuth のプロバイダ設定（`EMAIL_SERVER` / `EMAIL_FROM` / OAuth）を `.env` に追加。

## 次にやること
- AIスコア推定をタスク作成フローに自動適用するか決定。
- 自動化ルールの実処理（低/中/高スコアのフロー）を実装。
- 認証（NextAuth）とマルチユーザスキーマ設計を開始。
 - ログインUIとサインイン導線を追加。
