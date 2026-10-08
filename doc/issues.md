# 未解決の課題

解消済み項目の記録は Git 履歴に残し、この文書には次の判断・修正が必要なものだけを置く。

## 起動と検証

| 問題 | 確認済みの事実と次の対応 |
| --- | --- |
| 空の DB への migration | `20260129054106_add_audit_log_indexes` が未作成の `Task.automationState` を参照して失敗する。既存 DB の履歴を保護して修復方法を決め、新規 DB と既存 DB の両方で検証する |
| MinIO イメージ | Compose / CI の `minio/minio:RELEASE.2024-08-17T01-24-54Z` を移行検証環境で取得できなかった。取得可能な配布元・代替版を選び、署名付き画像アップロードを確認する |
| 外部サービス | 実際の Google / GitHub / Discord OAuth 往復、AI ゲートウェイ、Bot の外部接続は移行時に未検証。認証情報を設定したステージングで確認する |

[Vite 移行時](vite-migration.md) の E2E は隔離 DB に現行スキーマを適用し、
同じリリースのソースから作った一時 MinIO を使用した。
空の DB から既存履歴を適用する CI や通常の Compose 起動が通る証拠にはならない。
GitHub Actions と AWS デプロイも、そのローカル検証には含めていない。

## Cloudflare移行

CD は停止中。CI は GitHub Actions でアプリの検証だけを行い、移行後もデプロイと分ける。
旧 AWS の配布・staging 制御 workflow は除去し、Terraform は旧構成の参照用に残す。

- **API と画面**: Node の listen・静的ファイル配信・process 初期化を Workers の fetch と Static Assets に置き換える。既存 URL、認証 Cookie、権限と CSRF を維持する。[Static Assets](https://developers.cloudflare.com/workers/static-assets/) / [Node 互換性](https://developers.cloudflare.com/workers/runtime-apis/nodejs/) を参照。
- **DB接続**: PostgreSQL の Serializable transaction と DB 制約を維持できる接続方式を検証する。Prisma の実行方式・接続寿命・キャッシュによる読取への影響を確認し、DB移行は別途判断する。
- **画像とジョブ**: S3互換ストレージの R2 対応、常駐 poller と Python 日次ジョブの移行方式を決める。再試行、冪等性、キャンセル、履歴保持の保証を維持する。
- **CI/CD再開**: Workers でのビルド・認証・DB・画像・ジョブの検証を CI に追加し、Cloudflare の対象環境と配布方式を決めてから CD を再開する。

## データと更新規則

- **DB-only の Task 互換列**: 旧 ECS タスクは DB migration 後も動くため、`status` / `automationState` と同期 trigger を残している。新版への切替と rollback 期間の終了後、互換列・旧 index・trigger/function・`TaskAutomationState` enum を撤去する。
- **AI ログの scope**: `AiSuggestion` / `AiUsage` は nullable の実行者・workspace を持ち、用途の違いを型だけでは表せない。owner と実行文脈を整理してから制約・型・保存形式を決める。
- **旧 Velocity 行**: Sprint を安全に特定できない手入力行の `sprintId` は null のまま保持する。新規作成は Sprint 終了時だけとし、推測で旧行を割り当てない。
- **明示メモリの保護**: 日次集計は `EXPLICIT` Claim を保護するが、[反応APIの受容率更新](../modules/ai/infrastructure/prisma-ai-operations.ts) は provenance を確認せず既存値を書き換える。同じ保護規則を適用する必要がある。

## 運用上の確認

依存監査の古い結果には削除済みの Next.js / NextAuth が含まれるため、現行構成の状態として扱わない。
AWS SDK・メール・MCP 等の残る依存は、更新判断の前に現在の lockfile で監査をやり直す。
機密情報の失効・履歴清掃の確認状況は [機密情報の扱い](security.md) を参照。
