# Holoplax

## スタック
- Next.js 16 / React 19
- Postgres（docker compose で起動）
- MinIO（S3 互換、docker compose で起動）
- NextAuth（認証予定）

## すぐ使う（docker compose）
1. `.env` を作成  
   `cp .env.example .env`
2. 必要なサービスを起動  
   `docker compose up -d db minio`
3. アプリを起動（dev モード）  
   `docker compose up web`

アクセス:
- Web: http://localhost:3000
- Postgres: localhost:5432（`.env` のユーザ/パス）
- MinIO: http://localhost:9000（S3 エンドポイント） / http://localhost:9001（コンソール）

## メモ
- `web` はソースをボリュームマウントし、dev モードで動作。`node_modules` はコンテナ側で作成。
- `DATABASE_URL` は `db` ホストを指す。NextAuth 用に `NEXTAUTH_SECRET` を設定してから起動する。
- Docker を使わずに動かす場合: `npm install && npm run dev`（別途 Postgres/MinIO を立ち上げる）。
