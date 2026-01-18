# 開発状況 (再整理)

## 実装済み（主要）
- UI/導線: ダッシュボード刷新、Backlog/Sprint/Review/カンバン導線、カンバンのドラッグ移動。
- タスク/スプリント: 説明・DoD・編集/削除、完了タスクの分離表示、スプリント開始/終了とベロシティ自動記録。
- AI/Automation: スコア/分解/提案、分解承認フロー、AI下準備（メール/実装方針/チェックリスト）生成と適用。
- インボックス/フォーカス: メモ取り込み・重複分析・タスク化、フォーカスキュー（Top 3 + 履歴）。
- 認証/管理: NextAuth（Credentials/Google/GitHub）、メール検証/リセット、管理者画面、ワークスペース招待/管理。
- Memory: MemoryType/Claim/Question のAPI + 設定UI、日次メトリクス（uv + python）で MemoryMetric/Claim を更新。
- ストレージ: MinIO 署名URLによるアイコンアップロード。

## 未実装/未接続
- 通知設定と配信（メール/Slack など）。
- インボックス連携の残り（カレンダー/メール）。
- AIスコア推定の作成時自動適用（現状は手動呼び出し）。
- MemoryQuestion の自動生成/運用ルール（質問の自動発火）。
- チーム/ワークスペース運用ルール（権限や自動化レベルの整理）。

## 運用メモ
- `.env` に `OPENAI_API_KEY` を入れるとAIエンドポイントが実呼び出しになる。
- AIログは `AuditLog` / `AiUsage` に集約。
- 日次メトリクスは EC2 cron で `scripts/metrics/metrics_job.py` を実行。

## 2026-01-20 リスク/対応メモ
- 孤児データ自動取り込み（タスク/ベロシティ/AIログ）を削除。マルチテナント隔離が壊れるリスクを解消。
- ワークスペース未作成ユーザー向けに `resolveWorkspaceId` で個人ワークスペース自動作成を追加。
- ミドルウェア `proxy.ts` を緩和し、未ログインでも静的アセットを配信可能に修正。
- 自動化しきい値 GET を `upsert` 化し、並列リクエストでの競合を回避。
- 孤児レコード全削除スクリプト `scripts/cleanup-orphans.mjs` を追加（手動実行で更地化）。
- 監査ログにAI使用履歴を統合し、管理者がコストを追える状態にした。
- 型の気になりポイント:
  - App Router の `params: Promise<{ id: string }>` は型も実行も冗長。
  - NextAuth セッション型は `types/next-auth.d.ts` で最低限の拡張のみ。
