# holoplax MCP Server

holoplax アプリケーション操作用の MCP (Model Context Protocol) サーバーです。

## セットアップ

### 1. 依存関係のインストール

```bash
cd mcp-server
npm install
```

### 2. ビルド

```bash
npm run build
```

### 3. 環境変数の設定

以下の環境変数を設定してください：

| 変数名 | 必須 | 説明 |
|--------|------|------|
| `DATABASE_URL` | Yes | PostgreSQL接続URL |
| `MCP_WORKSPACE_ID` | Yes | 操作対象のワークスペースID |
| `MCP_USER_ID` | Yes | 操作ユーザーのID |
| `ENCRYPTION_KEY` | No | AI設定の復号用キー（将来の拡張用） |

### 4. サーバーの起動

```bash
npm start
```

## Claude Desktop での設定

`claude_desktop_config.json` に以下を追加：

```json
{
  "mcpServers": {
    "holoplax": {
      "command": "node",
      "args": ["/path/to/holoplax/mcp-server/dist/index.js"],
      "env": {
        "DATABASE_URL": "postgresql://...",
        "MCP_WORKSPACE_ID": "clxxxxxx",
        "MCP_USER_ID": "clxxxxxx"
      }
    }
  }
}
```

## 提供ツール一覧

### タスク管理（5ツール）

| ツール名 | 説明 |
|---------|------|
| `list_tasks` | タスク一覧取得（フィルタリング対応） |
| `get_task` | 単一タスク取得 |
| `create_task` | タスク作成 |
| `update_task` | タスク更新 |
| `delete_task` | タスク削除 |

### スプリント管理（4ツール）

| ツール名 | 説明 |
|---------|------|
| `list_sprints` | スプリント一覧取得 |
| `get_current_sprint` | アクティブスプリント取得 |
| `create_sprint` | スプリント開始 |
| `close_sprint` | スプリント終了 |

### インテーク処理（3ツール）

| ツール名 | 説明 |
|---------|------|
| `list_intake` | インテークアイテム一覧 |
| `create_memo` | メモ作成 |
| `resolve_intake` | インテーク処理（dismiss/merge/create） |

### AI機能（3ツール）

| ツール名 | 説明 |
|---------|------|
| `ai_score` | タスクスコア・ポイント推定 |
| `ai_split` | タスク分割提案 |
| `ai_suggest` | タスク改善のAI提案 |

## ツール詳細

### list_tasks

タスク一覧を取得します。様々なフィルタリングオプションをサポート。

**パラメータ：**
- `status`: タスクステータス配列 (`BACKLOG`, `SPRINT`, `DONE`)
- `type`: タスクタイプ配列 (`EPIC`, `PBI`, `TASK`, `ROUTINE`)
- `urgency`: 緊急度 (`LOW`, `MEDIUM`, `HIGH`)
- `risk`: リスク (`LOW`, `MEDIUM`, `HIGH`)
- `tags`: タグ配列
- `assigneeId`: 担当者ID
- `dueBefore`: 期限（以前）
- `dueAfter`: 期限（以降）
- `minPoints`: 最小ポイント
- `maxPoints`: 最大ポイント
- `search`: 検索テキスト
- `limit`: 取得件数（デフォルト200、最大500）
- `cursor`: ページネーションカーソル

### create_task

新しいタスクを作成します。

**必須パラメータ：**
- `title`: タスクタイトル
- `points`: ストーリーポイント（フィボナッチ数: 1,2,3,5,8,13,21,34）

**オプションパラメータ：**
- `description`: 説明
- `definitionOfDone`: 完了条件
- `urgency`: 緊急度（デフォルト: `MEDIUM`）
- `risk`: リスク（デフォルト: `MEDIUM`）
- `status`: ステータス（デフォルト: `BACKLOG`）
- `type`: タイプ（デフォルト: `PBI`）
- `parentId`: 親タスクID
- `dueDate`: 期限（ISO 8601形式）
- `assigneeId`: 担当者ID
- `tags`: タグ配列
- `dependencyIds`: 依存タスクID配列

### update_task

既存タスクを更新します。

**必須パラメータ：**
- `taskId`: 更新対象のタスクID

その他のパラメータはすべてオプションで、`create_task` と同様です。

### create_sprint

新しいスプリントを開始します。既存のアクティブスプリントは自動的にクローズされます。

**パラメータ：**
- `name`: スプリント名（デフォルト: `Sprint-YYYY-MM-DD`）
- `capacityPoints`: キャパシティポイント（デフォルト: 24）
- `plannedEndAt`: 終了予定日

### close_sprint

現在のアクティブスプリントを終了します。完了ポイントはベロシティとして記録され、未完了タスクはバックログに戻ります。

### resolve_intake

インテークアイテムを処理します。

**パラメータ：**
- `intakeId`: インテークアイテムID
- `action`: アクション
  - `dismiss`: 却下
  - `merge`: 既存タスクにマージ
  - `create`: 新規タスク作成
- `taskType`: 作成時のタスクタイプ（`create` 時のみ）
- `targetTaskId`: マージ先タスクID（`merge` 時のみ）

### ai_score

タスクのスコアとストーリーポイントを推定します。

**パラメータ：**
- `title`: タスクタイトル（必須）
- `description`: タスク説明
- `taskId`: 関連タスクID

**レスポンス：**
- `points`: 推定ストーリーポイント
- `urgency`: 推定緊急度
- `risk`: 推定リスク
- `score`: スコア（0-100）
- `reason`: 推定理由
- `suggestionId`: 提案ID

### ai_split

タスク分割の提案を取得します。

**パラメータ：**
- `title`: タスクタイトル（必須）
- `description`: タスク説明
- `points`: 現在のストーリーポイント（必須）
- `taskId`: 関連タスクID

**レスポンス：**
- `suggestions`: 分割タスク配列
  - `title`: タスクタイトル
  - `points`: ストーリーポイント
  - `urgency`: 緊急度
  - `risk`: リスク
  - `detail`: 詳細
- `suggestionId`: 提案ID

## 開発

### ウォッチモード

```bash
npm run dev
```

### プロジェクト構成

```
mcp-server/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts           # エントリーポイント
│   ├── server.ts          # MCPサーバー本体
│   ├── config.ts          # 環境変数・設定管理
│   ├── context.ts         # 実行コンテキスト
│   ├── tools/
│   │   ├── index.ts       # ツール集約
│   │   ├── tasks.ts       # タスク管理ツール
│   │   ├── sprints.ts     # スプリント管理ツール
│   │   ├── intake.ts      # インテーク処理ツール
│   │   └── ai.ts          # AI機能ツール
│   └── services/
│       ├── tasks.ts       # タスクサービス
│       ├── sprints.ts     # スプリントサービス
│       ├── intake.ts      # インテークサービス
│       └── ai.ts          # AIサービス
└── README.md
```

## ライセンス

Private
