# Next.js から Vite / Hono への移行

依存とビルド工程を減らすため、Next.js を Vite の SPA と Hono の Node サーバーに置き換えた。
認証が前提でブラウザからのデータ取得が中心のため、SSR 用の別フレームワークは追加しない。
既存 React UI を使い、ページを React Router で遅延ロードする。

## 採用理由と維持した契約

`/api/*` は既存の Request / Response handler からルート表を生成する。
Auth.js Core により OAuth を独自実装せず Next.js の接続部分を外す。
`AUTH_SECRET` / `APP_URL` を推奨し、旧 `NEXTAUTH_SECRET` / `NEXTAUTH_URL` も受け付ける。
Cookie 名・暗号化形式・認証テーブル・`/api/auth/callback/*` は維持する。
認可、CSRF、セッション失効、レート制限、ワーカーを Node 側へ移した。

Web / MCP / Bot の依存を workspace で分け、Prisma CLI は専用配布にした。
Docker の Web / MCP 実行イメージには Prisma Client を含め、React・Bot SDK・ビルドツール・CLI は含めない。
ESLint を外して Biome と境界チェックに統一し、CI の Web ビルドを一回にした。
Prisma と既存 UI / S3 ライブラリは、DB・履歴・画面の移行範囲を広げないため残した。

ルート lockfile の `node_modules/` 項目は **829 → 677**。
任意 Bot と全プラットフォーム向けの項目を含む数で、容量の測定ではない。
マイグレーション専用 lockfile は別に 7 項目。ビルド時間は依頼どおり計測していない。

## 移行時の検証

lint・境界チェック・型チェック、332 件のユニットテスト、Web / MCP ビルド、
Docker 3 ターゲット、Web 実行イメージに対する Playwright 2 件を通した。
旧 Cookie の復号、認可、ルート選択、委譲、タスク・スプリント、画像、MCP キー、
画面遷移とログアウトを確認した。開発サーバーの画面・アセット・API 接続も確認済み。

隔離 DB / 一時 MinIO を使った検証であり、新規環境の起動と外部 OAuth は未検証の制約がある。
詳細は [課題](issues.md#起動と検証)。push・GitHub Actions 実行・AWS デプロイはこの検証に含めていない。
