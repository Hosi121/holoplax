# 開発日誌 (2026-01-20 追記)

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
- 設定画面からAI提案ログを削除（監査ログに統合）。
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
- 監査ログ画面を追加。`/admin/audit`（AI使用の集計を追加）
- AI設定の管理画面を追加。`/admin/ai`
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
- タスクの種別/親子構造を追加:
  - `TaskType` と `parentId`
  - `auto-split` の子タスクは親に紐付け
- AIプロバイダ設定を追加:
  - `AiProviderSetting`（provider/model/apiKey/baseUrl/enabled）
- シードスクリプト拡張（admin/testアカウントとサンプルデータ）。`scripts/seed-dev.mjs`
- AIログの監査統合:
  - `AI_SUGGEST` / `AI_SCORE` / `AI_SPLIT` / `AI_DELEGATE`
  - トークン/コスト/モデル/プロバイダ別集計

## 未実装/未接続の機能整理
- 自動化ルールの実処理（低/中/高スコアに応じた自動処理/分解/レビューの自動実行）。
- スプリント開始/終了の状態管理（現在ボタンはUIのみ）。
- 通知/ストレージ設定の実装（MinIO操作や設定保存は未接続）。
- インボックス連携（メモ/カレンダー/メール/チャットの取り込み）。
- AIスコア推定の自動適用（作成時に自動推定するフローは未実装）。
- やるべきこと（3件）/フォーカスキューは未実装。
- AI下準備モーダルは未実装。
- User/Workspace Memory の基盤は未実装。

## 技術メモ
- `.env` に `OPENAI_API_KEY` を入れるとAIエンドポイントが実呼び出しになる。
- AIログは `AiSuggestion` テーブルに保存。Task削除時はCascadeで削除。
- AIプロバイダは管理画面（/admin/ai）で切替可能。OpenAI互換/Anthropicに対応。

## 次にやること
- AIスコア推定をタスク作成フローに自動適用するか決定。
- 自動化ルールの実処理（低/中/高スコアのフロー）を実装。
- チーム/ワークスペース機能のUI/権限管理を設計。
- Plan First + 認知オフロード重視のUX再設計。

## 引き継ぎメモ（今後やりたいこと）
- ワークスペースに紐づくデータスコープ（Task/Velocity/AIログ）の切り替え実装。
- 自動化ルールの実処理（分解提案の自動起動、AI委任キューなど）。
- 画像アップロードをデータURLではなくS3/MinIO URL固定で扱う（現状はURL保存）。
- パスワード再設定/メール認証のUI文言・UXを整備。
- 監査ログからAI使用のコスト/トークンを管理者が俯瞰できるようにする（実装済だが要改善）。
- Plan中心導線（オンボーディング/ナビ再設計）を適用。

## 2026-01-20 リスク/対応メモ
- 孤児データ自動取り込み（タスク/ベロシティ/AIログ）を削除。マルチテナント隔離が壊れるリスクを解消。
- ワークスペース未作成ユーザー向けに `resolveWorkspaceId` で個人ワークスペース自動作成を追加。
- ミドルウェア `proxy.ts` を緩和し、未ログインでも静的アセットを配信可能に修正（サインイン/リセット画面のロゴ崩れ防止）。
- 自動化しきい値 GET を `upsert` 化し、並列リクエストでの競合を回避。
- 孤児レコード全削除スクリプト `scripts/cleanup-orphans.mjs` を追加（手動実行で更地化）。
- 監査ログにAI使用履歴を統合し、管理者がコストを追える状態にした。
- 型の気になりポイント:
  - App Router の `params: Promise<{ id: string }>` は型も実行も冗長。`{ params: { id: string } }` に直すと読みやすさ/型整合性向上。
  - NextAuth セッション型は `types/next-auth.d.ts` で最低限の拡張のみ。`role`/`disabledAt` に依存する箇所は未定義を許容するか、型を強化してフォールバックを統一すると安全。
