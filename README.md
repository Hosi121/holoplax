# Holoplax

個人の仕事をAIに任せ、バックログ・スプリント・振り返りをつなぐタスク管理ツール。
現在の実行AIは、文章の成果物を生成して検証する範囲を扱う。

画面は Vite / React / React Router、API は Hono / Node.js、認証は Auth.js Core。
データは PostgreSQL / Prisma、画像は S3 互換ストレージに保存する。

## 開発

Node.js 24 と Docker を使う。新規環境では、既存のマイグレーション履歴と
MinIO イメージに [起動を妨げる問題](doc/issues.md#起動と検証) が残っている。

```bash
cp .env.example .env
npm ci --workspace server --workspace mcp-server --include-workspace-root
npx prisma generate
```

`.env` の `AUTH_SECRET` と `ENCRYPTION_KEY` に、それぞれ `openssl rand -hex 32` で
生成した値を設定する。接続先の一覧は [.env.example](.env.example) を参照。
`APP_URL` は通常 `http://localhost:3000`。旧 `NEXTAUTH_SECRET` / `NEXTAUTH_URL` も受け付ける。

```bash
docker compose up -d db minio
npx prisma migrate dev
npm run dev
```

Web / API は `localhost:3000`、DB は `localhost:5433`、MinIO は `localhost:9000`
（管理画面は `9001`）。開発用アカウントが必要な場合だけ `npx prisma db seed` を実行する。

AI は `AI_*` → `LITELLM_*` → `OPENAI_*` の順で設定を参照する。
LiteLLM を使うなら `docker compose up -d litellm`（ポート `4000`）を実行し、
[モデル設定](litellm.config.yaml) と `AI_MODEL` を合わせる。直接 OpenAI に接続する場合は
`.env` のゲートウェイ向け設定を外す。

## コマンド

| 用途 | リポジトリ直下で実行 |
| --- | --- |
| lint・境界チェック | `npm run lint` |
| 型チェック | `npm run typecheck` |
| ユニットテスト | `npm run test:run` |
| E2E（DB・MinIO が必要） | `npm run test:e2e` |
| 本番ビルド・起動 | `npm run build` → `npm run start` |
| MCP ビルド | `npm run build:mcp` |

Docker の配布先は [Dockerfile](Dockerfile) の `web` / `mcp` / `migrations` ターゲット。
例: `docker build --target web -t holoplax-web .`。Bot の依存は通常の Web 開発に含めない。

## ドキュメント

| 読みたいこと | 正本 |
| --- | --- |
| 目的と製品方針 | [要件](doc/requirements.md) |
| 実行構成・モジュール境界 | [構成](doc/architecture.md) |
| タスク・スプリント・履歴の規則 | [ドメイン](doc/work-item-domain.md) |
| 実行AIの権限と完了判定 | [委譲](doc/personal-delegation.md) |
| メモリ・指標・AI提案 | [メモリ](doc/user-memory.md) |
| Discord / Slack | [外部連携](doc/integrations.md) |
| MCP の起動・接続 | [MCP](mcp-server/README.md) |
| AWS 構成・配布 | [Terraform](infra/terraform/README.md) |
| 未解決の問題・未検証の範囲 | [課題](doc/issues.md) |
| Next.js を外した理由と検証 | [移行記録](doc/vite-migration.md) |
| 機密情報の漏洩時の対応 | [機密情報の扱い](doc/security.md) |
