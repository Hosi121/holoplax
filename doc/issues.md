# 未解決・未検証の範囲

解消済み項目はGit履歴に残し、ここには次の判断が必要なものだけを置く。

- Cloudflare account・環境とresource IDは未設定。D1 / R2 / Queueの実作成、Email送信ドメイン設定、データ切替、手動配布は未実施。[移行手順](cloudflare.md)を使う。
- 実際のGoogle / GitHub OAuth、Email Service、AI provider、Cloudflare上のQueue / Cronは未検証。ローカルD1 / R2 / Workerの検証は実サービス接続の証拠にしない。
- Cloudflare構成のCIは `24d67d2` でGitHub上の成功を確認済み。CDは停止中。
- 進捗チャートとタスク傾向分析の再設計は未実施。既存の振り返りと完了ペースを保ち、バーンダウン等の表示は次の作業で対象・指標を決める。
- `AiSuggestion` / `AiUsage` のownerは履歴保持のためnullable。実行者とworkspaceが失われた履歴を消さず、scopeの再設計は別途扱う。
- 機密情報の失効・履歴清掃の完了は確認できない。[扱いと対応順](security.md)を参照。
