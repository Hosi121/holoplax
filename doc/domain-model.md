# ドメインモデル v0（たたき台）

## 目的
- 生活/仕事タスクにアジャイルの概念を持ち込みつつ、日々のタスク運用を損なわない。
- AIは「提案→承認→実行」のライフサイクルを持つ補助者として扱う。
- AI実行基盤の進化に合わせ、人間との協働を前提にしたモデルを作る。
- 人間の認知負荷（判断/切替/曖昧さ）がボトルネックという仮説を前提に設計する。
- コアモデルは安定させ、連携や自動化は拡張可能にする。

## 価値の前提（合意メモ）
- 対象は「個人のセルフマネジメント」が中心。
- ワークスペースはコンテクスト分離のために使う。
- 価値は「認知負荷の軽減」「継続の支援」「成果の最大化」を同時に狙う。
- 差別化は「AIが先回りで下準備」「アジャイルの運用定着」「障害除去」。
- 中心ループは Capture / Plan。実行は人間で、AIは準備と計画の支援に徹する。
- 成功指標はタスク進行量、Sprint Velocity、PBI Velocity。
- 北極星は「ベロシティの最大化とその維持」。
- 使うほど最適化される「伴走者」になるために、ユーザー情報の蓄積を行う。

## コンセプト仮説
- AI実行基盤は急速に進化するが、協働の基盤が不足している。
- 人間の認知コストが進行速度の律速になっている。
- アジャイルのフレームを生活/仕事に当てると無駄が減り、再現性が上がる。

## 境界づけ（Bounded Context）
- コア（Life Agile）: Objective, WorkItem, Sprint, Dependency
- 自動化/AI: IntakeItem, AutomationProposal, Approval, AutomationExecution, AiSuggestion, CoachInsight
- 連携: Slack/Discord/Calendar/Email（入力/出力チャネル）
- 管理/監査: AuditLog, AiProviderSetting
- レポート: VelocityEntry, トレンドスナップショット

## コアエンティティ
- Workspace: 仕事の入れ物（メンバー/設定を含む）
- User: ワークスペースのメンバー
- Objective（目標/成果）: 長期の達成目標（期限や成功条件）
- WorkItem: 実務の中心単位（type = EPIC/PBI/TASK/ROUTINE）
- Sprint: コミット対象をまとめるタイムボックス
- Dependency: WorkItem 間の依存

## 自動化/AI エンティティ
- IntakeItem: 外部入力の原文（WorkItem化する前）
- AutomationProposal: AI提案（根拠や信頼度を含む）
- Approval: 人の判断記録（承認/却下/保留）
- AutomationExecution: 実行ログ
- AiSuggestion: AI出力の保存（アーティファクト）
- CoachInsight: スクラムマスター的な洞察（リスク/詰まり/改善提案）
- UserMemory: ユーザー情報の蓄積（嗜好/制約/リズム/前提）
- WorkspaceMemory: ワークスペース情報の蓄積（共通ルール/リズム/制約）
- AiProviderSetting: グローバルのモデル/APIキー設定
- AuditLog: 監査用の不変イベントログ

## 関係（概念）
- Workspace 1..* WorkItem
- Workspace 1..* Sprint
- Workspace 1..* Objective
- Objective 0..* WorkItem（主に EPIC/PBI）
- WorkItem 0..1 parent WorkItem（階層）
- WorkItem 0..* children WorkItem
- WorkItem 0..* Dependency（依存関係）
- Sprint 0..* WorkItem（コミットされたアイテム）
- IntakeItem → AutomationProposal → Approval → WorkItem/Execution
- AuditLog は user/workspace と AI利用のメタ情報を参照

## 期待する制約（後で強制）
- EPIC はバックログに留め、Sprint には直接入れない。
- PBI と TASK は Sprint にコミット可能。
- ROUTINE は Sprint に混ぜても良い（別枠運用も許容）。
- 依存が未完了の WorkItem は SPRINT/DONE へ移動不可。
- AI由来のアクションは必ず AuditLog に残す。
- AIの実行は「提案/承認/実行」を標準とし、例外のみ自動実行を許容。
- 自動実行の範囲は「低リスク・下準備」に限定する（文面下書き、実装方針案など）。
- 対外送信・課金・不可逆操作は必ず人の承認を要求する。

## リスクポリシー（暫定）
- 低リスクの基準は保守的な最低ラインで開始する。
- ユーザーごとに「徐々に引き上げる」運用を想定する。
- 初期基準はスコアベースで判定する。
  - 低スコア = `score < lowThreshold`（初期値は 35）
  - 中/高スコア = `score >= highThreshold`（初期値は 70）
  - 35/70 は暫定で、ポイント感（3pt=27, 5pt=45, 8pt=72）に合わせた仮置き

## ライフサイクル（高レベル）
- Capture: IntakeItem を作成（連携/手入力）
- Triage: AIが分解/見積もり/割当を提案
- Decision: Approval が承認/却下
- Execution: WorkItem を作成/更新、Execution を記録
- Review: Sprint クローズ、ベロシティ/洞察を更新

## 認知ボトルネック対策（設計指針）
- Focus Queue: 今やるべき少数の候補に圧縮する。
- WIP制限: 同時進行数を見える化し、過剰な切替を抑制。
- Definition of Done: 完了条件の定型化で迷いを減らす。
- AIの行動は「次の一手」に集約して提示する。

## KPI（暫定）
- 未完了数（未完了WorkItemの件数）を主要KPIにする。
- 未完了数は ROUTINE も含める。

## 表示方針（暫定）
- スコアは内部指標として扱い、数値はユーザーに見せない。
- UI上は「優先度ラベル」「理由（期限が近い等）」のみを簡潔に示す。

## スクラムマスターAIの役割（暫定）
- 目的: 障害を取り除くことに集中する。
- 手段: 通知とワークフロー提案は状況に応じて使い分ける。

## 実装の方針メモ
- WorkItem を中心テーブルにして変更コストを抑える。
- Objective は必要になったら追加する（拡張前提）。
- AiSuggestion は出力保管用で、監査の真実は AuditLog。
- UserMemory は「明示入力 + 行動からの要約」で更新し、必ず可視化/削除可能にする。
