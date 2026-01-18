# 数理モデル/アルゴリズムまとめ（Draft）

## 目的
- 個別最適化のために、日次の指標更新と軽量な状態推定を安定運用する。
- 初期は「オンライン更新（EMA）」で十分な価値を出し、将来的に予測/介入へ拡張する。

## 用語
- 指標: MemoryMetric（期間集計）
- 現在値: MemoryClaim（最新の前提/傾向）
- decayDays: 忘却の時定数（指数減衰）

## 1) 指標更新（MVP）
### 日次バッチ
入力:
- Task/WorkItem、TaskStatusEvent（ステータス遷移）
- ApprovalDecision/AutomationExecution（AI協働ログ）

出力:
- MemoryMetric（daily / weekly）
- MemoryClaim（EMAで平滑化した現在値）

### EMA（指数移動平均）
```
alpha = 1 - 2^(-1/decayDays)
y_hat_t = alpha * y_t + (1 - alpha) * y_hat_{t-1}
```
- decayDays は「何日で半減するか」の直感を持たせる。
- 欠測時は y_t をスキップし、y_hat_t = y_hat_{t-1} とする。

### 不確実性（簡易）
```
var_t = alpha * (y_t - y_hat_t)^2 + (1 - alpha) * var_{t-1}
```
- Confidence を作るなら `1 / (1 + var_t)` など簡易関数で十分。

### ヒストグラム指標（start_time_band）
- 168bin（24x7）を持つ。
- bin毎に EMA を適用し、正規化して分布にする。

## 2) 潜在状態（将来拡張）
### 最小構成（2状態）
- flow_state: 詰まりやすさ/処理能力
  - 入力: lead_time, WIP, blocked, throughput
- ai_trust_state: AI受容度
  - 入力: accept_rate, edit_rate, delegate_success, approval_latency

### 実装の最小形
- 上記指標のEMAをそのまま「状態」とみなす（線形混合で良い）。
- 余裕が出たら状態空間モデル（線形ガウス）に移行する。

## 3) 予測（将来拡張）
### Time-to-done（生存分析）
目的:
- 期限内完了確率、残時間分布の推定。

入力候補:
- WIP, blocked, lead_time履歴, dueまでの残日数

出力:
- P(done before due)
- expected_remaining_time

## 4) 介入（将来拡張）
### 文脈付きバンディット（安全制約つき）
文脈:
- start_time_band, flow_state, ai_trust_state, 直近WIP/blocked

行動:
- 提案タイプ、通知タイミング、自動実行レベル

報酬:
- deadline_adherence改善、blocked低下、edit率低下、承認遅延低下

安全制約:
- 高リスク操作は ai_trust_state が高い時のみ許可。
- それ以外は「提案のみ/ドラフトのみ」に落とす。

## 実装レイヤ（運用想定）
- 日次バッチ: uv + python + SQL 集計
- 実行基盤: EC2 cron（user-data でセットアップ）
- まずは EMA 更新のみで十分（学習/推論の重さを避ける）
- イベント駆動は後で追加（TaskStatusEventをトリガに軽量更新）
