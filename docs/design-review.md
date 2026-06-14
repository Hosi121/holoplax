# 設計レビュー台帳 (2026-06-15)

メトリクス先行で全 ~40 Prisma モデル + 全 55 route handler を機械的に走査した結果。
各指摘は grep/計測の裏取り付き。Severity = 影響 × 再発確率（S1=高 / S2=中 / S3=低）。
修正は未着手（承認後に着手）。

## 全体像（コンテキスト地図と「二重文脈」）

項目を潰す前に、ドメインを俯瞰すると暗黙の境界づけられたコンテキストはこう:

```
[Identity/Tenancy]  User · Workspace · Member · Invite · (Account/Session/VerificationToken)
        │ 全コンテキストが User/Workspace ハブを共有（境界なし・自由横断）
        ▼
[Work Planning]   Task · Sprint · VelocityEntry · TaskStatusEvent · TaskDependency
   ├─ [Scheduling]   RoutineRule  ── ※ Task と二重表現（後述 X2）
   ├─ [AI Assist]    AiSuggestion · AiPrepOutput · AiUsage · AiPricing · AiProviderSetting
   ├─ [Automation]   UserAutomationSetting · AutomationStageHistory ── ※ Task.automationState と分離(X5)
   └─ [Intake]       IntakeItem → Task を生む
[Memory]          MemoryType · MemoryClaim · MemoryQuestion · MemoryMetric   （比較的独立）
```

中心に **Task という god-aggregate** が居て、planning / breakdown / scheduling / AI / automation / intake の
**全コンテキストが Task の別スライスを読み書き**している（28 ファイルが参照）。これが「全体感」での一番の歪み。

### 二重文脈（同一概念が別文脈で使われている）— 実測ベース

| # | 概念 | 二重の中身 | 証拠 | 害 |
|---|---|---|---|---|
| **X1** | `source` | **同名で4〜5の無関係文脈**: TaskStatusEvent(誰が遷移) / MemorySource(取得方法 EXPLICIT,INFERRED) / IntakeSource(流入元 MEMO,DISCORD) / AiUsage.source(設定の出所 db,env,provider) / AiSuggestion 等のタグ(ai-apply,approval…) | `source` の値空間に api/INFERRED/DISCORD/db/ai-split… が混在 | 読む側が毎回文脈再ロード。同名同型なのに意味が無関係＝偶発的同音異義語 |
| **X2** | 「繰り返しか?」 | **二重表現**: `TaskType.ROUTINE`(enum 軸) と `RoutineRule`(実体) の両方で表現 | createTask は type===ROUTINE かつ cadence の時だけ RoutineRule 生成→**ROUTINE なのに rule 無しが作れる**／syncRoutineRule という整合グルーが必要になっている | 二箇所が desync しうる。「これは繰り返し？」に矛盾2答 |
| **X3** | `TaskType` | **直交2軸を1 enum に圧縮**: EPIC/PBI/TASK(分解階層) ＋ ROUTINE(スケジュール性質) | enum TaskType = EPIC,PBI,TASK,ROUTINE | 「PBI かつ routine」が表現不能。階層と周期が排他になる |
| **X4** | `TaskAutomationState` | **2つの自動化機能を1状態機械に**: DELEGATED(委任) ＋ PENDING_SPLIT/SPLIT_*(分割) | enum 値が委任系と分割系の混在 | 委任中かつ分割中が表現不能。別 feature が排他に縛られる |
| **X5** | automation | **1機能が2モデルに分離**: per-task `automationState`(状態) と per-user `stage`+`AutomationStageHistory`(閾値段階)。stage が state 遷移を駆動するのに住所が別 | 別モデル・別語彙 | 1つの自動化フローを追うのに2箇所を往復 |
| **X6** | 所有(scope) | `userId? + workspaceId?` で **USER文脈と WORKSPACE文脈を1行に同居**（Memory の MemoryScope、8モデル） | S1-1/S2-4 と同根 | NULL-distinct 罠・孤児を量産（既出バグの根） |

### 逆に「正しく分離できている」例（横展開の手本）
`status` は **コンテキストごとに別 enum**（TaskStatus / SprintStatus / IntakeStatus / MemoryStatus / MemoryQuestionStatus / AiPrepStatus）。
これは“1つの status を使い回さない”正しいモデリング。**source / type / automation も本来この粒度で文脈ローカル化すべき**。

### 俯瞰での3大テーマ（個別16件はこの現れ）
1. **Task の過負荷**（god-aggregate）: 全文脈が1実体に集中 → X2/X3/X4 は「Task に機能を生やし続けた」結果。
2. **偶発的同音異義語**（X1 source / "Type" 過積載）: 文脈ローカルにせず共通名を使い回した。
3. **所有の任意性**（X6）: 単一テナント→マルチテナント移行の負債が nullable FK として残存。

---

## サマリ（Severity 別件数）
- S1: 4 （所有権 nullable / レイヤ結合 / アネミック集約 / Velocity 設計）
- S2: 7
- S3: 5

---

## S1 — 構造的

### S1-1 所有 FK が nullable（マルチテナントの根幹欠陥）
`Task.userId` / `Task.workspaceId` が **両方 `String?`**。アプリは全クエリを `workspaceId` で絞るのに、
所有者なしの行が作れてしまう＝誰からも見えない孤児。`scripts/cleanup-orphans.mjs` が
`OR: [{workspaceId:null},{userId:null}]` を削除して回っている時点で**運用債務として顕在化済み**。
- 影響モデル（userId? かつ workspaceId? 両 nullable）: `Task, VelocityEntry, AiSuggestion, AiPrepOutput, AiUsage, MemoryClaim, MemoryQuestion, MemoryMetric`
- 既出の「NULL-distinct unique 制約バグ」「IDOR 周辺」は**この根（任意所有）の症状**。前回はそこを直さず症状だけ塞いだ。
- 是正案: 所有モデルは `workspaceId` を NOT NULL に。user/workspace の二択スコープが要るものは「所有は workspace 必須 + 任意の userId(担当/作成者)」に整理。data migration 必要 → 要計画。

### S1-2 レイヤ結合（service 層が tasks だけ）
route handler **51/55 が prisma を直 import**。`*-service.ts` は `lib/tasks/task-service.ts` の **1本のみ**。
業務ロジックと永続化が transport 層に張り付いている。tasks 以外は単体テスト不能。
- 是正案: feature ごとに薄い service 層（tasks のパターンを横展開）。

### S1-3 アネミックモデル（不変条件の所有者不在）
sprint 容量・task の status 遷移・memory の single-active が、集約ではなく
手続き（service/handler）＋ DB 部分 unique index に散在。「Sprint とは容量を超えないもの」を Sprint が守っていない。
- 是正案: 不変条件を feature service に集約（最低限）／将来は集約オブジェクト化。

### S1-4 Velocity が「派生の手入力化」
`VelocityEntry` は `name` + `points` + `range: String`（自由文字列）の手入力テーブルで、**Sprint と未接続**。
velocity は本来「完了 Sprint の done points」＝ Sprint からの投影（read-model）。二重管理 + stringly-typed。
- 是正案: `Sprint.endedAt` + `TaskStatusEvent` からの projection に置換（product 判断要）。

---

## S2 — 中

### S2-1 死蔵モデル: `MemoryMetric`（accessor 参照 0）
コード参照ゼロ。なのにフル定義 + 部分 unique index 用の migration まで存在（前回その migration を私が書いた…
使われないテーブルのために）。実装するか drop するか決める。

### S2-2 死蔵モデル: `FocusQueue`（accessor 参照 0）
daily-focus はメモリ内計算で、この永続テーブルを使っていない。drop か wire。

### S2-3 `MemoryClaim` と `MemoryQuestion` の構造重複
両者とも `valueStr/Num/Bool/Json` + confidence を持ち、Question は実質「未確定 Claim」。
lifecycle 差を別テーブル化した結果、値形状が二重定義。`status` 統合 or 意図の明確化。

### S2-4 ポリモーフィック所有（二択 nullable FK）パターンの常態化
S1-1 と同根。8 モデルで `userId? + workspaceId?` の OR 所有。partial unique index でしか一意性を担保できず、
NULL-distinct 罠を量産する構造。

### S2-5 event-type が stringly-typed
`AuditLog.action` (String) / `AiUsage.action` (String)。監査アクション種別が enum 化されていない。
値集合は有限なので enum 化可能（要値棚卸し）。

### S2-6 `AiUsage.source` が String のまま
今回 `TaskStatusEvent.source` だけ enum 化したが `AiUsage.source` は String 据え置きで**不整合**。

### S2-7 `Sprint` の所有曖昧
`userId` + `workspaceId` 両持ち。個人/チームどちらのスプリントか不明。チーム前提なら userId は `createdById`。

---

## S3 — 低 / 命名

### S3-1 `Session` / `VerificationToken` 未使用
JWT strategy + Email provider 未使用のため adapter scaffold として未稼働。adapter 型の都合で単純 drop は不可。
「意図的に未使用」とドキュメント化 or adapter 構成見直し。

### S3-2 `MemoryType` の命名（実体なのに "Type"）
enum 命名規約（`MemoryValueType`, `TaskType`…）と衝突。`MemoryDefinition` / `MemoryAttribute` 推奨。

### S3-3 `MemoryType.granularity` / `updatePolicy` が String（enum 候補）

### S3-4 `AiProviderSetting` シングルトン（`id @default(1)`）
config-as-row アンチパターン（`AutomationSetting` は今回 drop 済み、これが残党）。

### S3-5 大量の untyped `Json`
`AuditLog.metadata`, `Task.checklist`, `AiSuggestionReaction.modification`, `Memory*.valueJson/evidence`,
`IntakeItem.items/payload`。柔軟性とのトレードオフだが、少なくとも checklist など固定形状のものは型付け可能。

---

## なぜ前回の「レビュー」で出なかったか（プロセス指摘）
初回は line-level のバグ狩り（security/correctness）のみで、**メトリクス先行の構造走査**
（モデル使用棚卸し / 所有 FX nullability / service 層数 / stringly-typed 検出）を**一切回していなかった**。
本台帳の S1〜S3 は全て上記の機械走査を1回流すだけで初回に出ていたはずのもの。

## 推奨着手順
1. **即・低リスク**: S2-1/S2-2 死蔵 drop、S2-6 `AiUsage.source` enum 化、S3-4 残党 singleton。
2. **低リスク高効果**: S2-5 `action` enum 化、S3-2 `MemoryType`→`MemoryDefinition`。
3. **要計画 (data migration)**: S1-1 所有 FK NOT NULL 化（最重要・最大）。
4. **要 product 判断**: S1-4 Velocity 投影化、S2-3 Claim/Question 統合、S2-7 Sprint 所有。
5. **継続**: S1-2 service 層横展開、S1-3 不変条件の集約。
