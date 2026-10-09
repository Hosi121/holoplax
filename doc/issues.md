# 未解決・未検証の範囲

解消済み項目はGit履歴に残し、ここには次の判断が必要なものだけを置く。

- Cloudflare account・環境とresource IDは未設定。D1 / R2 / Queueの実作成、Email送信ドメイン設定、データ切替、手動配布は未実施。[移行手順](cloudflare.md)を使う。
- 実際のGoogle / GitHub OAuth、Email Service、AI provider、Cloudflare上のQueue / Cronは未検証。ローカルD1 / R2 / Workerの検証は実サービス接続の証拠にしない。
- CI workflowはCloudflare構成へ変更済み。GitHub上での実行結果はpush後に確認する。CDは停止中。
- `AiSuggestion` / `AiUsage` のownerは履歴保持のためnullable。実行者とworkspaceが失われた履歴を消さず、scopeの再設計は別途扱う。
- 機密情報の失効・履歴清掃の完了は確認できない。[扱いと対応順](security.md)を参照。
