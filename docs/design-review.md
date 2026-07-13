# 設計レビュー台帳

最終更新: 2026-07-13

この文書は現行実装の負債だけを扱う。過去に指摘された nullable Task ownership、
`TaskType.ROUTINE`、汎用 `source`、旧 `MemoryType` など、既に解消済みの内容は台帳から除外した。

## 今回解消した項目

- タスク一覧用インデックスと安定したカーソル順序を追加。
- Web/MCP の TaskType を Prisma 定義へ統一し、残存していた `ROUTINE` を除去。
- MCP の旧 `source` フィールド参照を `origin` / `trigger` へ修正。
- MCP の重複 Prisma Client/CLI を廃止し、root の生成済み Client を単一利用。
- Web/MCP のストーリーポイント定義をそれぞれ一箇所へ集約。
- SPRINT タスク作成時の active sprint 必須化と、ポイント更新時の容量検証を統一。
- MCP に RoutineRule の作成・更新・完了時の次回タスク生成を追加。
- onboarding を原子的かつ多重送信に対して冪等なトランザクションへ変更。
- 未使用の FocusQueue 永続モデル、未参照 UI/フック/request context を削除。
- 日付入力を Prisma 到達前に検証し、AI reaction の負の latency を拒否。
- 純粋なドメインテストから jsdom/React の不要なテスト環境を削除。
- Web/MCP の Task query/application service と入力 contract を単一実装へ統合。
- Web/MCP の Sprint service を統合し、開始・終了・Velocity 投影・Task 戻しを原子的に実行。
- workspace 内の ACTIVE Sprint を DB の partial unique index で一件に制約。
- Velocity の手入力経路を廃止し、Sprint と一対一の read model に一本化。
- Web/MCP の Intake service を統合し、二重 resolve と merge の lost update を防止。
- Intake から作る Task に初期 status event と通常の automation を適用。
- Web/MCP の AI service と入力 contract を統合し、MCP も provider・fallback・監査・利用量記録を利用。
- MCP を root の application service を含む単一 bundle として構築し、Prisma singleton も共有。
- Workspace owner の削除規則を schema と実DBで `RESTRICT` に統一。
- Task status 履歴に不変の task key/title を保存し、Task 削除後も Review の活動履歴を保持。
- dependency の REQUIRED/WAIVED/再有効化を append-only event として保存し、Task 削除後も意思決定を監査可能に変更。
- 現在の RoutineRule を持つ Task の削除時だけ series を停止し、過去 occurrence の削除では停止しない規則を統一。
- 全 Serializable transaction を bounded retry 付き共通 unit-of-work へ集約。
- 単体更新と bulk 更新の lifecycle projection/policy を application planner へ集約。
- automation job に常駐 poller、heartbeat、stale claim 回復、所有権付き完了CAS、terminal failure 再投入操作、health 可視化を追加。
- Review の backlog 集計をDB集約へ変更し、固定1000件取得とクライアント再集計を廃止。
- status event、dependency、Serializable transaction の直接バイパスを architecture check で禁止。
- bulk lifecycle の検証結果と保存値を明示的 execution plan に統一し、CANCELED 再開規則も単体・一括で共通化。
- task 一覧の全 consumer を cursor 完走へ変更し、Sprint は `sprintId` でDB側絞り込み。
- automation health に設定可能な PENDING/RUNNING 滞留閾値を追加し、false-green を解消。
- Sprint期間、Memory owner scope、dependency tenant/self edge、Audit actor削除時の履歴保持をDB制約化。

## 残存負債

新規 VelocityEntry は `sprintId` を持つ。旧手入力行は移行時に Sprint を安全に特定できないため
nullable の legacy row として保持するが、新たに作る経路は Sprint 終了だけに限定した。

### P2: nullable ownership の残存

MemoryClaim / MemoryQuestion / MemoryMetric は排他的 owner CHECK を持つ。AiSuggestion / AiUsage
などは実行者とworkspace文脈を同時に保持するため nullable FK の組を残しており、用途の違いを型だけでは
表現しきれていない。

次の方針: scope 別テーブルへの分離、または owner kind/id の明示モデル化を設計してから移行する。

### P2: 互換 TaskAutomationState の撤去

automation workflow は `automationStatus`、分割由来の構造は `hierarchyRole` に分離済みだが、
旧クライアント向け projection として `TaskAutomationState` をまだ dual-write している。

次の方針: クライアント移行と本番 backfill 検証後に互換列と projection 関数を撤去する。

### P2: 依存監査で自動修正不能な項目

Next.js / AWS SDK には監査上の修正版が示されるが、現在利用可能な npm registry では要求版を
取得できなかった。Nodemailer / NextAuth 系には非破壊の自動修正が提示されていない。
MCP SDK の修正可能項目は更新済み。

次の方針: registry に修正版が反映された時点で再度 `npm audit` を実行し、同一メジャー内で更新する。
