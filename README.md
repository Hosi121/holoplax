# Holoplax

現在は、バックログ・スプリント・振り返りをつなぐタスク管理ツール。
今後はdotsが操作する記憶システムへ再設計する。Discord / Slack連携は廃止済み。
画面は Vite / React / React Router、API・認証・MCPは Hono / Auth.js Core を使う Cloudflare Worker。
保存先は D1 / R2、ジョブは Queues / Cron、メールは Cloudflare Email Service。

## 開発

Node.js 24 を使う。Dockerや外部DBは不要。

```bash
npm ci --workspace server --workspace mcp-server --include-workspace-root
cp .dev.vars.example .dev.vars
# AUTH_SECRET / ENCRYPTION_KEY をそれぞれ openssl rand -hex 32 で生成して設定
npm run dev
```

`localhost:3000` で開く。Viteは内部で `5173` を使う。
D1 migrationは起動時に適用され、D1 / R2 の開発データは `.wrangler/` に保存される。
開発アカウントが必要な場合だけ `npm run seed` を実行する。

AIの設定は `AI_*` → `LITELLM_*` → `OPENAI_*` の順。
本番のURL・binding・secretsと既存データの扱いは [Cloudflare移行](doc/cloudflare.md) を参照。

## コマンド

| 用途 | コマンド |
| --- | --- |
| lint・境界チェック | `npm run lint` |
| 型検査・bindingの整合性 | `npm run typecheck` / `npm run check:cf-types` |
| ユニット・D1実環境テスト | `npm run test:run` |
| ブラウザテスト（隔離D1・R2を自動起動） | `npm run test:e2e` |
| Vite・Workerのdry-runビルド | `npm run build` |
| ビルドした画面をローカルWorkerで配信 | `npm run start` |
| MCP stdioブリッジのビルド | `npm run build:mcp` |

CIは [GitHub Actions](.github/workflows/ci.yml) でローカルのCloudflare実行環境を検証する。
Cloudflare認証やAWSサービスは不要。**CDは停止中**。

## ドキュメント

| 内容 | 正本 |
| --- | --- |
| 目的と製品方針 | [要件](doc/requirements.md) |
| 実行構成・モジュール境界 | [構成](doc/architecture.md) |
| タスク・スプリント・履歴 | [ドメイン](doc/work-item-domain.md) |
| 実行AIの権限 | [委譲](doc/personal-delegation.md) |
| メモリ・指標・AI提案 | [メモリ](doc/user-memory.md) |
| MCPの接続 | [MCP](mcp-server/README.md) |
| 配布準備・データ移行 | [Cloudflare](doc/cloudflare.md) |
| 未解決・未検証の範囲 | [課題](doc/issues.md) |
| Next.jsを外した記録 | [Vite移行](doc/vite-migration.md) |
| 機密情報の扱い | [セキュリティ](doc/security.md) |
