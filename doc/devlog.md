# 開発日誌 (2026-01-16)

## 進捗概要
- ダッシュボードをグラフ中心のUIへ刷新（KPI/ベロシティ/バーンダウン/バックログ状況/活動ログ）。
- カンバン画面を追加し、ドラッグでステータス移動を実装。`app/kanban/page.tsx`
- Taskに説明を追加し、編集/削除UIをバックログ/スプリントに実装。
- AI機能を拡張：
  - `/api/ai/score`：スコア/ポイント推定（OpenAI or ヒューリスティック）
  - `/api/ai/split`：分解提案（OpenAI or ヒューリスティック）
  - `/api/ai/logs`：AI提案ログ
  - `/api/ai/suggest`：ログ保存対応
- 分解提案は一定ポイント超過のみ表示、分解確定時は元タスク削除。
- 設定画面にAI提案ログ＋アカウント編集（名前/メール/アイコン画像）を追加。
- スプリント画面で完了タスクを別セクションに分離（DONEを薄く表示）。
- 認証/ユーザー分離:
  - NextAuth（Credentials + Google + GitHub）導入。`lib/auth.ts`
  - `UserPassword` 追加でメール+パスワード認証
  - Admin/ユーザー役割、管理者は全データ参照
  - 未ログインは `/auth/signin` へリダイレクト（middleware）
- 認証拡張:
  - メール認証フロー（verify画面 + トークン）
  - パスワード再設定フロー（forgot/reset）
- 管理者向けユーザー管理ページを追加。`/admin/users`
- 監査ログ画面を追加。`/admin/audit`
- ワークスペース管理画面（作成/招待/メンバー管理）を追加。`/workspaces`
- APIの共通化（認証/エラーレスポンス）を実施。`lib/api-response.ts`, `lib/api-auth.ts`
- MinIOへのアイコン画像アップロード導線を追加（署名付きURL + 公開URL）。`lib/storage.ts`, `app/api/storage/avatar`
- マイグレーション追加:
  - `add_task_description`
  - `add_ai_suggestion_log`
  - `cascade_ai_suggestions`
  - `add_nextauth_and_multiuser`
  - `add_user_password`
  - `add_user_role`
- シードスクリプト拡張（admin/testアカウントとサンプルデータ）。`scripts/seed-dev.mjs`

## 未実装/未接続の機能整理
- 自動化ルールの実処理（低/中/高スコアに応じた自動処理/分解/レビューの自動実行）。
- スプリント開始/終了の状態管理（現在ボタンはUIのみ）。
- 通知/ストレージ設定の実装（MinIO操作や設定保存は未接続）。
- インボックス連携（メモ/カレンダー/メール/チャットの取り込み）。
- AIスコア推定の自動適用（作成時に自動推定するフローは未実装）。

## 技術メモ
- `.env` に `OPENAI_API_KEY` を入れるとAIエンドポイントが実呼び出しになる。
- AIログは `AiSuggestion` テーブルに保存。Task削除時はCascadeで削除。

## 次にやること
- AIスコア推定をタスク作成フローに自動適用するか決定。
- 自動化ルールの実処理（低/中/高スコアのフロー）を実装。
- チーム/ワークスペース機能のUI/権限管理を設計。

## 引き継ぎメモ（今後やりたいこと）
- ワークスペースに紐づくデータスコープ（Task/Velocity/AIログ）の切り替え実装。
- 自動化ルールの実処理（分解提案の自動起動、AI委任キューなど）。
- 画像アップロードをデータURLではなくS3/MinIO URL固定で扱う（現状はURL保存）。
- パスワード再設定/メール認証のUI文言・UXを整備。
