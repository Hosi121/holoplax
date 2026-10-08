# Vite / Hono への移行

依存の量とビルド工程を減らすため、Next.js を Vite の SPA と Hono の Node サーバーに置き換えた。
ビルド時間は計測していないため、短縮幅についての評価は行っていない。

## 採用した構成

- 画面は既存の React コンポーネントを維持し、React Router で遷移する。各ページを遅延ロードする。
- `/api/*` は Hono が提供する。従来の `Request` / `Response` を使うハンドラーを
  `server/routes` に移し、ビルド時にルート表を生成する。静的パスをパラメーターより優先する。
- `/review` のデータ取得は認証付き `/api/review` に移す。
- パスワード認証と OAuth は Auth.js Core を使用する。独自の OAuth 実装を増やさず、
  Next.js のアダプターだけを除去するため、この構成にした。
- `AUTH_SECRET` / `APP_URL` を推奨し、既存の `NEXTAUTH_SECRET` / `NEXTAUTH_URL` も受け付ける。
  既存のセッション Cookie 名、暗号化形式、OAuth callback URL、認証テーブルを維持する。
  旧ライブラリが生成した暗号化セッションを固定テストデータとして復号するテストを追加した。
- CSRF、API の認可、パスワード変更によるセッション失効、レート制限、セキュリティヘッダー、
  バックグラウンドワーカーを Node サーバーに移す。

認証が前提のアプリで、従来も大部分の画面はブラウザでデータを取得していた。
公開ページの SEO や SSR を必要とする用途ではないため、SSR 用の別フレームワークは追加しなかった。

## 依存と配布の整理

| 対象 | 含めるもの |
| --- | --- |
| ルート | React UI とビルド・型チェック・テスト用ツール |
| `server` | Hono、Auth.js Core、認証アダプター |
| `packages/runtime` | Prisma Client、S3、メールなどサーバーモジュールの共通依存 |
| `mcp-server` | MCP SDK と HTTP サーバー |
| `bots` | Discord / Slack SDK。通常の Web 開発と CI ではインストールしない |
| `packages/migrations` | 独立したロックファイルを持つ Prisma CLI の配布依存 |

ESLint と Next.js 用の lint 設定を除去し、既存の Biome とアーキテクチャチェックに統一した。
ルートのロックファイルの `node_modules/` 項目は変更前 829 件から変更後 677 件になった。
この数は任意の Bot と全プラットフォーム向けパッケージを含むロック項目数であり、
インストール容量やブラウザ転送量の測定ではない。マイグレーション専用ロックには別途 7 項目がある。

Dockerfile は Web、MCP、マイグレーションのターゲットを共有する。
Web と MCP の実行イメージには React、Next.js、Bot SDK、Vite、TypeScript、Prisma CLI を含めない。
Prisma Client の生成物はビルド段階からコピーする。CLI の optional peer を実行環境に
入れないため、実行依存のインストールでは optional 依存と生成スクリプトを省略する。
マイグレーション CLI は専用イメージから実行するよう CD も変更した。

CI の Playwright はビルド済み成果物を起動する。従来の Web ビルドの重複を取り除いた。
ローカル開発は `npm run dev`、本番成果物は `npm run build` と `npm run start` で起動する。

Prisma ORM、React、既存 UI ライブラリ、S3 SDK は既存機能を支えるため残した。
ORM まで同時に変更すると DB 操作・トランザクション・履歴の比較範囲が広がるため、
今回は Next.js と配布依存の分離を優先した。

## 検証

- Biome、アーキテクチャチェック、Web / API / MCP の TypeScript 型チェック。
- 332 件のユニットテスト。旧セッションの復号、認可、CSRF、静的ルートの優先順位、
  自動 OPTIONS と非対応メソッドの応答を含む。
- Web / MCP のビルドと、Docker の Web / MCP / マイグレーション各ターゲットのビルド。
- Web の実行イメージに対する Playwright 2 件。DB ヘルスチェック、登録、オンボーディング、
  委譲、タスク操作、スプリント容量競合、完了・締め処理、画像の署名付きアップロード、
  アカウント保存、MCP キー作成、振り返りへの旧 URL、SPA のリンク、ログアウト・認可を確認。
- Web / MCP の実行イメージの依存を調べ、Next.js、React、Bot SDK、ビルドツール、
  Prisma CLI がないことを確認。Prisma Client は含まれる。
- マイグレーションイメージの Prisma CLI 起動、Terraform の書式、CI/CD YAML と
  変更した起動テンプレートの構文を確認。
- Vite の開発画面、アセット、API の接続もブラウザで確認。

## 残る制約

新規 DB に既存のマイグレーション履歴を適用すると、
`20260129054106_add_audit_log_indexes` が未作成の `Task.automationState` を参照して失敗する。
移行コードの検証には、今回専用に作成した隔離 DB に現行スキーマを適用した。
既存の DB、スキーマ、マイグレーション履歴は変更していない。
この問題により、現状の CI を空の DB から通すことはできない。

CI と docker-compose の固定 MinIO イメージ
`minio/minio:RELEASE.2024-08-17T01-24-54Z` は検証環境から取得できなかった。
画像アップロードの E2E は同じリリースのソースから作成した一時 MinIO を使用した。
配布元や代替ストレージの選定は今回行っていない。

Google / GitHub / Discord の実際の OAuth 往復は、認証情報がないため未検証。
設定とハンドラーは移行しているが、ステージングでの確認は別途必要。
AI ゲートウェイ・Bot の外部サービス接続も今回のローカル検証には含めていない。

GitHub Actions の実行、AWS への変更、push、デプロイは行っていない。
