# Holoplax

## スタック
- Next.js 16 / React 19
- Postgres（docker compose で起動）
- MinIO（S3 互換、docker compose で起動）
- NextAuth（認証予定）
- OpenAI（`OPENAI_API_KEY` を `.env` に設定）

## すぐ使う（DB/バケットは Docker、Next はホスト）
1. `.env` を作成  
   `cp .env.example .env`
2. DB/MinIO を起動  
   `docker compose up -d db minio`
3. Next.js をホストで起動（dev モード）  
   `npm install && npm run dev`

アクセス:
- Web: http://localhost:3000
- Postgres: localhost:5433（ホストからアクセス）/ コンテナ内は db:5432
- MinIO: http://localhost:9000（S3 エンドポイント） / http://localhost:9001（コンソール）

## メモ
- `docker compose` は DB/MinIO のみを管理。Next.js はホストで `npm run dev` を実行する。
- `DATABASE_URL` はホストからは `localhost:5433`（コンテナ内は `db:5432`）。NextAuth 用に `NEXTAUTH_SECRET` を設定してから起動する。
- MinIO のエンドポイントはホストから `http://localhost:9000` を使う。
- OpenAI を使うときは `.env` に `OPENAI_API_KEY` を設定する（キーはコミットしないこと）。
- Prisma マイグレーション: `DATABASE_URL=postgresql://holoplax:holoplax@localhost:5433/holoplax npx prisma migrate dev --name init`
