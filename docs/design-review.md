# 設計レビュー台帳

最終更新: 2026-07-12

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

## 残存負債

### P1: Web と MCP の Task application service が二重化

両者は同じ Task 集約を操作するが、別サービスとして実装されている。今回、主要な不変条件と
RoutineRule の振る舞いは揃えたものの、将来の変更で再度 drift する可能性がある。

次の方針: transport 非依存の Task application service を共有パッケージへ移し、Web route と
MCP tool は認証済みコンテキストを渡す adapter に限定する。

### P1: VelocityEntry が手入力と Sprint 終了時投影の二経路を持つ

`POST /api/velocity` は手入力を許し、Sprint 終了処理も VelocityEntry を自動生成する。
同じ指標に二つの生成規則があり、重複・意味の不一致が起こり得る。

次の方針: product 判断後、Sprint からの read model に一本化するか、手入力値を別モデル・別名称へ分離する。

### P2: nullable ownership の残存

AiSuggestion / AiUsage / MemoryClaim などは USER scope と WORKSPACE scope を nullable FK の組で表す。
部分 unique index で active claim の一意性は守っているが、所有規則はDB型だけでは表現しきれていない。

次の方針: scope 別テーブルへの分離、または owner kind/id の明示モデル化を設計してから移行する。

### P2: TaskAutomationState が複数機能を一つの状態列に持つ

委任状態と分割状態が同じ enum にあるため、両機能の同時進行を表現できない。

次の方針: delegation と split workflow を個別状態へ分離する。既存データ移行が必要。

### P2: 依存監査で自動修正不能な項目

Next.js / AWS SDK には監査上の修正版が示されるが、現在利用可能な npm registry では要求版を
取得できなかった。Nodemailer / NextAuth 系には非破壊の自動修正が提示されていない。
MCP SDK の修正可能項目は更新済み。

次の方針: registry に修正版が反映された時点で再度 `npm audit` を実行し、同一メジャー内で更新する。
