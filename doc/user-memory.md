# ユーザー情報の蓄積（たたき台）

## 目的
- 使うほど最適化される「伴走者」になるための基盤を作る。
- 人間の認知ボトルネックを減らす判断材料として使う。
- 個別最適化を主用途として設計する（説明可能性は中程度）。

## 設計方針（Memory Layers）
個別最適化を前提に「現在値の高速参照」と「変化の追跡」を分離する。
- Claim: 現在の前提/嗜好/制約（最新値を引きやすくする）
- Metric: 期間集計や時系列（動的な傾向を扱う）
- Evidence: 中程度の説明可能性のため、詳細ログは必須にしない
  - Claim に「根拠の要約（件数/期間/参照ソース）」を保持する

## 何を貯めるか（候補）
- 嗜好: 朝型/夜型、集中時間帯、好むコミュニケーション形態
- 制約: 週の可処分時間、締切厳守の度合い、外部依存の多さ
- 実行パターン: ルーティンの完遂率、着手から完了の平均時間
- 判断ルール: 低リスクの基準、承認の必要条件
- コンテクスト: 役割/現在のテーマ/仕事と生活の比率

## 取得方法
- 明示入力: オンボーディング/設定で入力
- 行動からの要約: スプリント履歴や完了ログから推定
- AIの要約: 期間ごとに「最近の傾向」を短く要約

## 表示と制御
- ユーザーが編集・削除できる
- 参照元（明示/推定）と更新日を表示
- 影響が大きい項目は必ず説明付き

## 初期実装案
- UserMemory { id, scope(user/workspace), type, value, source, confidence, updatedAt }
- Workspace スコープと User スコープを分離

## DB設計（提案）
用途は個別最適化を主にし、動的指標は Metric で扱う。

### MemoryType（カタログ）
メモリの種類と粒度・更新ポリシーを管理する。
- key: 例 `deadline_adherence_30d`
- scope: user / workspace
- valueType: string / number / bool / json
- メトリクス向けの valueType 案: ratio / duration_ms / histogram_24x7 / enum(low|mid|high) / ratio_by_type
- granularity: point / daily / weekly / monthly
- updatePolicy: explicit_only / derived / mixed
- decayDays: 有効期限の目安

### MemoryClaim（現在値）
静的/半静的な情報を「最新値」として保持する。
- value は string/number/bool/json のどれかで保存
- confidence と source（explicit/inferred）で更新ルールを制御
- validFrom/validTo でバージョン管理
- evidence は「件数/期間/参照ソース」などの要約のみ保持

### MemoryMetric（時系列）
動的な傾向は期間集計で保持する。
- windowStart/windowEnd を持つ
- 例: 30日 rolling、直近3スプリント

## Workspace Memory（追加案）
- チームのリズム/ルール/共通制約を蓄積
- 例: スプリント長、会議の固定日、レビューの粒度、共通のDoD
- team_workflow_schema: ステータス集合と遷移定義（lead_time/time_in_status の定義基盤）

## 確信度に応じた確認モーダル
- confidence が一定以上で「仮説」を立てる（暫定: 0.7）
- 例: "学部3年かもしれない" など
- モーダルで質問し、ユーザーが肯定/否定/保留できる
- 確認結果は source を明示して保存

## 最小セット（暫定）
- 実行パターン（完了率/着手→完了時間）
- 生活リズム（朝型/夜型）
- 期限の厳しさ（守る/柔軟）

## 指標の定義メモ（壊れやすいところ）
- focus_time_band: Start と Done を分けて集計（週次ヒストグラムで集中帯を推定）
- lead_time_median_30d: 着手はステータス遷移（ToDo→InProgress）を採用
- deadline_adherence_30d: 最終期限基準を基本にし、期限変更率は別指標に分離
- deadline_drift_30d: 初期期限からの変化量/回数を別途計測
- sprint_velocity_* と estimation_error_30d: 個人運用なら size(S/M/L) 併用も検討
- ai_cost_per_point_30d: point非対応領域向けに ai_cost_per_outcome_30d を併設
- ai_auto_exec_tolerance: リスク段階 × ユーザー閾値の2軸で運用
- time_in_status_p50_30d: team_workflow_schema の定義に追随させる

## 初期導入（11）
個人最適化（7）
- start_time_band_weekly: 着手時間帯分布（weekly）
- routine_completion_rate_30d
- lead_time_median_30d
- deadline_adherence_30d
- wip_avg_14d
- blocked_time_ratio_14d
- throughput_14d

AI協働（4）
- ai_proposal_accept_rate_30d（タイプ別）
- ai_edit_rate_30d
- ai_delegate_success_rate_30d
- approval_latency_p50_30d

## MemoryTypeカタログ（初期）
| key | valueType | granularity | decayDays |
| --- | --- | --- | --- |
| start_time_band_weekly | histogram_24x7 | weekly | 56 |
| routine_completion_rate_30d | ratio | daily | 30 |
| lead_time_median_30d | duration_ms | daily | 30 |
| deadline_adherence_30d | ratio | daily | 30 |
| wip_avg_14d | float | daily | 14 |
| blocked_time_ratio_14d | ratio | daily | 14 |
| throughput_14d | float | daily | 14 |
| ai_proposal_accept_rate_30d | ratio_by_type | daily | 30 |
| ai_edit_rate_30d | ratio_by_type | daily | 30 |
| ai_delegate_success_rate_30d | ratio | daily | 30 |
| approval_latency_p50_30d | duration_ms | daily | 30 |

## 更新/忘却の扱い（decayDays）
rolling window ではなく指数減衰の時定数として使うと、オンライン更新が簡単。
```text
alpha = 1 - 2^(-1/decayDays)
y_hat_t = alpha * y_t + (1 - alpha) * y_hat_{t-1}
```

## 将来拡張メモ（潜在状態）
最低限2つの潜在状態で十分回る想定。
- flow_state: 処理能力/詰まりやすさ（lead time / WIP / blocked / throughput から推定）
- ai_trust_state: 提案受容度（accept / edit / delegate / approval latency から推定）
まずは「指数移動平均 + 不確実性（分散）」程度でも実運用は可能。

## 将来拡張メモ（予測/介入）
- 予測: Time-to-done は生存分析（締切内完了確率や残時間分布）
- 介入: 文脈付きバンディット + 安全制約（高リスク操作は信頼状態が高い時のみ）

## 指標候補（個別最適化）
### 個人行動
- focus_time_band: 完了/着手の時間帯分布（朝型/夜型判定、weekly）
- routine_completion_rate_30d: ROUTINE 完遂率（30日rolling）
- lead_time_median_30d: 着手→完了の中央値（日数）
- deadline_adherence_30d: 期限内完了率（30日rolling）
- deadline_drift_30d: 期限変更率（30日rolling、初期期限との差分）
- wip_avg_14d: 平均同時進行数（14日rolling）
- sprint_velocity_avg_3: 直近3スプリントの完了ポイント平均
- sprint_velocity_stability_3: ベロシティ分散（安定性）
- estimation_error_30d: 見積もりポイントの誤差（30日rolling）
- dependency_block_rate_30d: 依存で止まったタスク率（30日rolling）
- context_preference: 仕事/生活の比率や優先テーマ（explicit + 更新）
- blocked_time_ratio_14d: ブロック状態（待ち）の割合（14日rolling）
- time_in_status_p50_30d: ステータス滞在時間の中央値（30日rolling）
- scope_change_rate_30d: 着手後にポイント/要件が増減した割合（30日rolling）
- reopen_rate_30d: 完了→再オープン率（30日rolling）
- throughput_14d: 14日で完了した件数/ポイント

### AI協働
- ai_proposal_accept_rate_30d: 提案の承認率（タイプ別）
- ai_auto_exec_tolerance: 自動実行の許容度（閾値調整に使う）
- ai_edit_rate_30d: AI提案後の人手修正率
- ai_delegate_success_rate_30d: AI委任の完了率（ロールバックなし）
- rollback_rate_30d: AI delegate のロールバック率
- approval_latency_p50_30d: 承認までの中央値（通知/UX調整）
- ai_cost_per_point_30d: コスト/トークンの効率（監査ログから算出）
- ai_cost_per_outcome_30d: 完了1件あたりのコスト（ポイント非依存の代替）
- ai_accept_rate_by_risk: リスク段階別の承認率
- ai_edit_distance_30d: 提案からの編集量（軽微修正を成功扱いにする）
