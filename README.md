# Holoplax

個人の仕事を安全に任せられる実行AIと、バックログから振り返りまでをつなぐタスク管理ツール。

## 主な機能

- **バックログ / カンバン / スプリント** — タスク管理の基本ビュー
- **自分専用の実行AI** — 自然文の依頼から成果物を作り、完了条件に照らして検証
- **AI 提案** — タスク分割、ストーリーポイント推定、優先度スコアリング
- **自動化エンジン** — 閾値ベースでタスク分割・委譲を自動提案（段階的に自律度が上がる）
- **フォーカスキュー** — 今やるべきタスクを3件に絞って提示
- **ベロシティ追跡** — スプリントごとの実績を可視化
- **インテーク（受信箱）** — メモや外部連携からのタスク取り込み
- **MCP サーバー** — Claude Desktop 等から直接タスク操作が可能
- **Discord / Slack 連携** — チャットからタスク作成・インテーク投入
- **ワークスペース** — チーム単位でのマルチテナント管理
- **メモリシステム** — ユーザーの傾向を学習し、AI 提案を改善

## スタック

| レイヤー | 技術 |
|---------|------|
| フロントエンド | Vite / React 19 / React Router / Tailwind CSS |
| バックエンド | Hono / Node.js 24 / Zod バリデーション |
| DB | PostgreSQL 16（Prisma ORM） |
| ストレージ | MinIO（S3 互換） |
| 認証 | Auth.js Core（パスワード / Google / GitHub / Discord） |
| AI | LiteLLM ゲートウェイ（OpenAI / Anthropic / Gemini） |
| MCP | 独自 MCP サーバー（API キー認証） |
| テスト | Vitest / Biome（lint + format） |

## セットアップ

### 1. 環境変数

```bash
cp .env.example .env
# AUTH_SECRET と ENCRYPTION_KEY を生成して設定（旧 NEXTAUTH_SECRET も使用可能）:
# openssl rand -hex 32
```

### 2. インフラ起動

```bash
docker compose up -d db minio    # DB + オブジェクトストレージ
docker compose up -d litellm     # AI ゲートウェイ（任意）
```

### 3. 依存関係

```bash
npm ci --workspace server --workspace mcp-server --include-workspace-root
npx prisma generate
```

### 4. DB マイグレーション + シード

```bash
npx prisma migrate dev
npx prisma db seed               # 開発用アカウント作成
```

### 5. 開発サーバー起動

```bash
npm run dev
```

既存のマイグレーション履歴と MinIO イメージには、新規環境の起動を妨げる問題がある。
詳細は [移行記録](doc/vite-migration.md#残る制約) を参照。

### アクセス先

| サービス | URL |
|---------|-----|
| Web | http://localhost:3000 |
| PostgreSQL | localhost:5433 |
| MinIO (S3) | http://localhost:9000 |
| MinIO Console | http://localhost:9001 |
| LiteLLM | http://localhost:4000 |

## コマンド

```bash
npm run dev          # 開発サーバー
npm run build        # 画面 + Node サーバーのプロダクションビルド
npm run typecheck    # Web / API / MCP の型チェック
npm run build:mcp    # MCP サーバーのビルド
npm run test:run     # テスト実行
npm run lint         # Biome lint
npm run check        # lint + format 自動修正
```

## AI ゲートウェイ設定

`AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL` が最優先。未設定なら `LITELLM_*` → `OPENAI_*` の順でフォールバックする。

LiteLLM を使う場合は `litellm.config.yaml` の `model_list` にモデルを追加し、`AI_MODEL` を一致させる。

## MCP サーバー

Claude Desktop 等の MCP クライアントから、タスク作成・スプリント管理・AI 提案の実行が可能。

1. Web UI の設定画面で API キーを発行
2. MCP クライアントにエンドポイントとキーを設定

提供ツール: tasks / sprints / intake / ai

## プロジェクト構成

```
app/              # Vite + React の画面
  delegate/       # 個人向け実行AIワークスペース
  backlog/        # バックログビュー
  kanban/         # カンバンビュー
  sprint/         # スプリントビュー
  velocity/       # ベロシティチャート
  admin/          # 管理画面（ユーザー / AI / 監査ログ）
  settings/       # ユーザー設定
server/
  routes/         # API ルート（REST、従来の /api URL を維持）
lib/
  contracts/      # Zod スキーマ（入力バリデーション）
  http/           # エラーハンドリング / バリデーションヘルパー
  integrations/   # Discord / Slack 連携
modules/
  delegation/     # 委譲ポリシー / ユースケース / 永続キュー / AIアダプター
mcp-server/       # MCP サーバー（独立 Node.js プロセス）
prisma/           # スキーマ + マイグレーション
bots/             # Discord / Slack SDK を持つ任意の npm workspace
packages/runtime/ # API と MCP が共有する実行依存
packages/migrations/ # 独立した Prisma CLI の配布依存
scripts/          # ビルド / シード / メンテナンス
```

## 開発と配布

Node.js 24 を使用する。`npm run dev` は http://localhost:3000 で画面と API を提供する。
Vite の開発サーバーは内部で 5173 番ポートを使い、画面だけをコンパイルする。
API は `server/routes/**/route.ts` の GET / POST 等からビルド時にルート表を生成する。
新しい API ファイルを追加した場合は開発サーバーを再起動する。

認証設定は `AUTH_SECRET` / `APP_URL` を推奨する。既存の `NEXTAUTH_SECRET` /
`NEXTAUTH_URL` も互換設定として受け付ける。OAuth callback の `/api/auth/callback/*`、
既存のユーザー・連携アカウントテーブル、セッション Cookie と暗号化形式を維持する。

Bot も使う場合はインストールコマンドに `--workspace bots` を加え、
`npm run bot:discord` / `npm run bot:slack` で起動する。

```bash
docker build --target web -t holoplax-web .
docker build --target mcp -t holoplax-mcp .
docker build --target migrations -t holoplax-migrations .
```

Web / MCP のイメージには各サーバーが必要とする実行依存だけを入れる。
Prisma Client は含め、マイグレーション CLI は専用イメージに分離する。
CI の E2E は `E2E_BUILD_READY=1` でビルド済み成果物を使用する。
詳細と検証上の制約は [移行記録](doc/vite-migration.md) を参照。
