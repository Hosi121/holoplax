# メモリ・指標・AI提案

ユーザーと workspace の傾向を、計画支援と提案の出し方に使う。
現在値と集計履歴を分け、明示入力と推定を区別する。

## 保存モデル

| モデル | 用途 |
| --- | --- |
| `MemoryDefinition` | 指標や嗜好の種類、scope、値型、更新設定 |
| `MemoryClaim` | 現在の値、確信度、`EXPLICIT` / `INFERRED` の由来 |
| `MemoryMetric` | 集計期間ごとの値 |
| `MemoryQuestion` | ユーザーに確認する質問と回答 |
| `AiSuggestionReaction` | 提案への反応と、その時点の文脈・反応時間 |

Claim / Metric / Question の owner は user または workspace の一方だけ。
保存形式は [Prisma schema](../prisma/schema.prisma)、編集と質問は [memory module](../modules/memory) を参照。

## 更新と利用

[日次ジョブ](../scripts/metrics/metrics_job.py) は workflow event のスナップショットから
処理量、リードタイム、期限内完了率、WIP を集計する。AI反応からは種別ごとの受容率・修正率・
反応時間を集計し、workspace の `flow_state` / `ai_trust_state` も更新する。
AWS では EventBridge から ECS タスクを起動する。

数値の現在値には `alpha = 1 - 2^(-1/decayDays)` の指数移動平均を使う。
欠測値は更新しない。日次ジョブは明示 Claim を推定で上書きしないが、
反応APIの即時更新には [保護が不足している](issues.md#データと更新規則)。
指標キー・集計窓・SQL はジョブ内を正本とし、文書に複製しない。

提案の反応は `VIEWED` / `ACCEPTED` / `MODIFIED` / `REJECTED` / `IGNORED` を記録する。
[反応APIの実装](../modules/ai/infrastructure/prisma-ai-operations.ts) は閲覧以外の反応で受容率を即時更新する。
`ACCEPTED` と `MODIFIED` を受容として数える。

[context hook](../app/backlog/hooks/use-suggestion-context.ts) が現在の傾向を読み、
[提案ルール](../app/backlog/hooks/use-proactive-suggestions.ts) が分割・見積もり・補足の候補を選ぶ。
WIP と受容率で候補を抑え、一つのタスクに重複して出さない。適用はユーザーが判断する。

## 方針と未実装の案

明示した希望を推定より優先し、ユーザーがメモリを編集・削除できる方針を守る。
信頼指標は [実行権限](personal-delegation.md) を広げる根拠にしない。
生存分析による完了予測や文脈付きバンディットは将来案で、現在の指標・提案ルールには含めない。
