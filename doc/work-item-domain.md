# タスクとスプリントの規則

仕事の実行状態とスプリントの計画所属を分ける。両者を一つの `status` で扱うと、
再開・分割・容量・ベロシティの判断が食い違うため、このモデルを採用した。
テーブル名 `Task` は維持し、一括リネームのための移行は行わない。

## 正本と互換性

| 概念 | 正本 |
| --- | --- |
| 実行状態 | `Task.workflowState`: `READY` / `IN_PROGRESS` / `BLOCKED` / `DONE` / `CANCELED` |
| 現在の計画所属 | `Task.sprintId`（active Sprint）と非除外の `SprintItem` |
| 計画時の見積もり・タイトル・種別 | `SprintItem` のスナップショット |
| 自動化の進行 | `automationStatus` |
| 分割での役割・生成元 | `hierarchyRole` / `origin` |
| 繰り返しの同一性 | `RoutineSeries` と現在の occurrence を持つ `RoutineRule` |

API の旧 `BACKLOG` / `SPRINT` / `DONE` は境界で導出する。
`workflowState = DONE` なら `DONE`、それ以外で active Sprint に所属すれば `SPRINT`、
残りは `BACKLOG`。内部ロジックで旧値を正本にしない。

D1では `Task.status` / `Task.automationState` と旧同期triggerを持たない。
旧DBからの変換では、互換列と正本の矛盾を検出して停止する。

## 更新時の規則

- `EPIC` は親を持たず、直接スプリントに入れない。`PBI` の親は `EPIC`、`TASK` の親は `PBI` または `TASK`。
- スプリントには末端の仕事だけを入れ、親子のポイントを二重計上しない。分割後は親を計画から外し、子だけを集計する。
- 未完了の子、必須の依存、未完了のチェックリストがある仕事は完了できない。依存先のキャンセルは達成として扱わない。
- 単体・一括操作は同じ planner を使う。旧 `status` による `DONE` / `CANCELED` の再開は `READY` に戻す。
- workspace 内の ACTIVE Sprint は DB 制約で一件だけ。予定終了日は開始日以降とし、容量の確認と保存、開始・終了・持ち越しは原子的に行う。
- ベロシティは Sprint 終了時の投影として作り、手入力しない。計画・実績の履歴は後日の Task 編集で変えない。
- 依存の解除は削除ではなく `REQUIRED` → `WAIVED` として記録する。再有効化も履歴に残す。自己依存と workspace をまたぐ依存は DB でも拒否する。
- 繰り返しの完了は同じ series の次回 Task を作る。現在の active occurrence の削除は series を停止し、過去 occurrence の削除では停止しない。
- メンバーを外すとその workspace の割り当ても外す。仕事は作成者の削除後も残り、workspace owner の削除は拒否する。

## 消してはいけない履歴

`TaskStatusEvent` / `TaskWorkflowEvent` は不変の task key、タイトル、集計に必要な日時・
見積もり・作成者を保持する。Task 削除後の振り返りと指標は live Task への join に依存しない。
進行中の仕事を削除する前には `CANCELED` 遷移を記録する。

`SprintItemEvent` は追加・再コミット・再開・完了・除外・持ち越しの判断を追記する。
持ち越し先は以前の SprintItem に結び付ける。`TaskDependencyEvent` も両端の Task 削除後に残す。
監査ログは actor が削除されても残る。

保存形式は [D1 migration](../migrations/0001_initial.sql)、遷移と計画判断は
[workflow](../modules/tasks/domain/task-workflow.ts) / [lifecycle planner](../modules/tasks/application/task-lifecycle.ts)、
スプリントの判断は [sprint policy](../modules/sprints/domain/sprint-policy.ts) を参照。
