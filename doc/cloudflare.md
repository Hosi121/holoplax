# Cloudflareの配布準備とデータ移行

実行先はWorkers + Static Assets、D1、R2、Queues、Cron、Email Service。
ローカル実装とCIにはCloudflare認証は不要。**リソース作成・本番データ移行・配布・CD再開は未実施**。
旧AWS / PostgreSQLの構成は Git `272ee3d` 以前に残る。AWSリソースは削除していない。

## 配布先を設定する

[wrangler.jsonc](../wrangler.jsonc) のD1 UUIDは開発用placeholder。
配布先が決まったら、対象accountと環境にD1・R2 bucket・Queueを作り、bindingを設定する。
`ENVIRONMENT=production`、公開HTTPSの `APP_URL`、検証済み送信ドメインの `EMAIL_FROM` を設定する。
`AUTH_SECRET` / `ENCRYPTION_KEY` とAI・OAuthの認証情報はWrangler secretsへ渡す。
既存の暗号文を読むには既存の `ENCRYPTION_KEY` が必要。鍵の交換とデータ移行を同時に行わない。

OAuth callbackは `/api/auth/callback/google` / `github`。
Email Serviceの送信ドメインと利用条件は [公式手順](https://developers.cloudflare.com/email-service/) に従う。
本番でメール未設定の場合は登録を拒否し、未検証メールを自動承認しない。

手動配布は、リソースとデータの検証後に `wrangler d1 migrations apply DB --remote`、
`npm run build`、`wrangler deploy` の順。CIはdry-runまででデプロイを呼ばない。
Queuesを含む構成のプランと、[D1のクエリ・サイズ制限](https://developers.cloudflare.com/d1/platform/limits/) を確認する。
大きな一括操作や集計はFreeの一イベント50クエリを超える場合がある。

## PostgreSQLからD1へ

旧サービスの書込みとジョブを止め、RUNNINGジョブを回収してからスナップショットを取る。
変換ツールは旧互換列の矛盾、未完了ジョブ、未知の列・欠けた列を拒否する。
ID、millisecond単位の日時、JSON、配列、暗号文、削除済みタスクの履歴を保持する。
旧schemaのtimezoneなし `timestamp(3)` はPrismaの保存規則に合わせUTCとして書き出す。
検索の大文字・小文字変換はSQLiteのASCII規則を使う。非ASCIIのcase foldingはPostgreSQLと一致しない場合がある。
Sprintを特定できない旧Velocityの `sprintId=null` はそのまま残す。
旧Discord / Slackの取込元や監査記録は履歴として保持し、新たな連携は提供しない。

```bash
umask 077
node --import tsx scripts/migrate-data.ts --export-sql > /private/export.sql
psql "$SOURCE_DATABASE_URL" -X -A -t -v ON_ERROR_STOP=1 -f /private/export.sql > /private/export.json
node --import tsx scripts/migrate-data.ts --input /private/export.json --output /private/import.sql
```

変換はファイルの作成だけ。まず空の隔離D1に現行migrationとSQLを適用して検証する。
SQLは空DBを要求し、全39テーブルの件数とforeign keyを検査する。
[公式のimport手順](https://developers.cloudflare.com/d1/best-practices/import-export-data/) に従い、
最初は `wrangler d1 execute DB --local --file /private/import.sql` でリハーサルする。
失敗したimport先は再利用せず、原因を直して空DBへやり直す。
行数だけでなく、ログイン・所属・スプリント履歴・暗号文の復号も照合してから配布先へ適用する。
検証が終わるまで旧DBのsnapshotを保管し、切替後のD1への書込み開始時刻を記録する。
D1で新しい書込みが発生した後のrollbackでは、旧DBへ戻すだけでは新しいデータを保持できない。

## 画像とジョブ

旧S3 / MinIOの画像はkey・MIME・checksumを揃えてR2へコピーし、検証後に画像URLを切り替える。
旧URLを推測で置き換えない。
ローカルのコピー・checksum照合・URL更新SQL作成は `scripts/migrate-avatars.ts` を使う。
manifestには `oldPublicBaseUrl`、切替先の `appUrl`、`objects`（`key` / `file` / `contentType` / `sha256`）を指定する。
`node --import tsx scripts/migrate-avatars.ts --manifest /private/avatars.json --source /private/export.json --output /private/urls.sql --local`
はR2の開発データだけを変更し、D1更新は行わない。
配布先の空R2へのコピーと照合が済んでから、同じURL更新SQLを適用する。新規画像は署名付きのWorker URLでR2へ書込み、同じURLの再利用を拒否する。
Queueの重複配信はD1のclaimで処理し、日次集計は同じ集計窓を再適用しない。
`EXPLICIT`メモリは日次集計・反応APIの両方で保護する。

外部OAuth・メール・AI・実際のQueue/Cronの往復は、配布先の認証情報を設定して確認する。
完了した段階と未検証の範囲は [課題](issues.md) に残す。
