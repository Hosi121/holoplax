# アクセスマップ v0（たたき台）

## 目的
主要UI画面のアクセスパターンを先に定義し、
モデル変更時のクエリ再設計コストを最小化する。

## 画面と必要データ

### ナビゲーション方針
- Plan First を前提に、初期到達は Plan 系画面に寄せる。
- ダッシュボードは状況把握/レビューの補助に回す。

### ダッシュボード (/)
- アクティブスプリント概要
  - Sprint: id, name, status, startedAt, plannedEndAt, capacityPoints
  - 集計: コミット点数、完了点数、完了率
- バックログスナップショット
  - BACKLOG の件数をポイント帯/タイプで集計
- 主要KPI
  - 未完了数（status != DONE の WorkItem。ROUTINE を含む）
- やるべきこと（3件）
  - 正規化スコアで優先度を算出
    - `priority = score * 0.7 + dueScore * 0.3`
    - dueScore は期限から 0-100 に正規化（期限なしは 0）
      - 0日以内 = 100、7日以内 = 60、14日以上 = 0（線形）
  - 将来的に推薦アルゴリズムへ置き換え前提
- 最近の活動
  - WorkItem 最近5件 or AuditLog
- ベロシティ
  - 直近N件の VelocityEntry

推奨クエリ:
- Sprint: workspaceId で ACTIVE を取得
- WorkItem: status/type/points の集計 + 最近5件
- VelocityEntry: workspaceId の直近7件

### バックログ (/backlog)
- WorkItem を status で絞り込み（BACKLOG/SPRINT切替）
- type 別にセクション分け（EPIC/PBI/TASK/ROUTINE）
- 依存ステータス（ブロック表示）
- 親タイトルと子の件数（階層）

推奨クエリ:
- workspaceId + status の WorkItem 一覧（依存込み）
- 件数が増える前提でページング

### スプリント (/sprint)
- アクティブスプリント（id, name, capacity）
- スプリント内のアイテム（SPRINT + DONE）
- 残容量/依存ブロック

推奨クエリ:
- ACTIVE Sprint を取得
- sprintId で WorkItem を取得
- 依存のステータスを取得

### カンバン (/kanban)
- status 別に WorkItem を分割
- 依存/AIタグの表示

推奨クエリ:
- workspaceId の WorkItem + 依存ステータス
- updatedAt/createdAt でソート

### 自動化 (/automation)
- 委任キュー、承認待ち、分解親子
- 直近の AI 提案と実行履歴
- 障害除去のための通知/提案

推奨クエリ:
- AIタグ・status で WorkItem を絞り込み
- AiSuggestion を workspaceId で直近20件
- AutomationExecution を workspaceId で直近N件
- 未完了依存（blocked）を抽出

### 設定 (/settings)
- ユーザープロファイル
- 自動化しきい値（low/high）
- ワークスペース一覧

推奨クエリ:
- User by id
- UserAutomationSetting by userId + workspaceId
- WorkspaceMember by userId

### 監査ログ (/admin/audit)
- 直近N件の AuditLog
- AI使用集計（トークン/コスト/モデル/プロバイダ）

推奨クエリ:
- AuditLog を createdAt desc で50件
- action prefix (AI_) でフィルタ可能

### AI設定 (/admin/ai)
- AiProviderSetting（provider/model/baseUrl/enabled）

推奨クエリ:
- AiProviderSetting id=1

### ワークスペース (/workspaces)
- ワークスペース一覧とロール
- 招待管理

推奨クエリ:
- WorkspaceMember + Workspace
- WorkspaceInvite by workspaceId

## 現在のAPI
- /api/tasks, /api/tasks/[id]
- /api/sprints, /api/sprints/current
- /api/workspaces/current, /api/workspaces/[id]/members
- /api/automation, /api/automation/approval
- /api/ai/suggest, /api/ai/score, /api/ai/split
- /api/admin/audit, /api/admin/ai

## メモ
- ダッシュボードは集計クエリ中心にする（全件取得を避ける）。
- select で必要なフィールドだけ取得する。
- 件数が増える画面は早めにページング/カーソルを入れる。
