# Holoplax

AI 駆動のプロジェクト管理ツール。タスクの自動分割・優先度スコアリング・スプリント管理をAIがサポートする。

## 主な機能

- **バックログ / カンバン / スプリント** — タスク管理の基本ビュー
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
| フロントエンド | Next.js 16 / React 19 / Tailwind CSS |
| バックエンド | Next.js API Routes / Zod バリデーション |
| DB | PostgreSQL 16（Prisma ORM） |
| ストレージ | MinIO（S3 互換） |
| 認証 | NextAuth（Email / Google / GitHub） |
| AI | LiteLLM ゲートウェイ（OpenAI / Anthropic / Gemini） |
| MCP | 独自 MCP サーバー（API キー認証） |
| テスト | Vitest / Biome（lint + format） |

## セットアップ

### 1. 環境変数

```bash
cp .env.example .env
# NEXTAUTH_SECRET と ENCRYPTION_KEY を生成して設定:
# openssl rand -hex 32
```

### 2. インフラ起動

```bash
docker compose up -d db minio    # DB + オブジェクトストレージ
docker compose up -d litellm     # AI ゲートウェイ（任意）
```

### 3. DB マイグレーション + シード

```bash
npx prisma migrate dev
npx prisma db seed               # 開発用アカウント作成
```

### 4. 開発サーバー起動

```bash
npm install
npm run dev
```

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
npm run build        # プロダクションビルド
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
app/
  api/            # API ルート（REST）
  backlog/        # バックログビュー
  kanban/         # カンバンビュー
  sprint/         # スプリントビュー
  velocity/       # ベロシティチャート
  admin/          # 管理画面（ユーザー / AI / 監査ログ）
  settings/       # ユーザー設定
lib/
  contracts/      # Zod スキーマ（入力バリデーション）
  http/           # エラーハンドリング / バリデーションヘルパー
  integrations/   # Discord / Slack 連携
mcp-server/       # MCP サーバー（独立 Node.js プロセス）
prisma/           # スキーマ + マイグレーション
scripts/          # シード / Discord Bot / メンテナンス
```
