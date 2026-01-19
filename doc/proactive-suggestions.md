# Proactive Suggestions 設計

## 概要

現状の「ボタン → AI」を「環境が先回り」に変える。

```
Before: ユーザー → ボタン → API → 提案表示
After:  コンテキスト監視 → 条件判定 → 自動提案 or 提案準備
```

---

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend (React)                        │
├─────────────────────────────────────────────────────────────┤
│  useSuggestionContext()     │  useProactiveSuggestions()    │
│  - flowState                │  - shouldShow(type)           │
│  - wipCount                 │  - autoTrigger conditions     │
│  - acceptRates              │  - prefetch suggestions       │
└──────────────┬──────────────┴───────────────┬───────────────┘
               │                              │
               ▼                              ▼
┌──────────────────────────┐    ┌─────────────────────────────┐
│  GET /api/ai/context     │    │  既存の suggestion APIs     │
│  - flowState             │    │  - /api/ai/suggest          │
│  - wipCount              │    │  - /api/ai/score            │
│  - acceptRates by type   │    │  - /api/ai/split            │
│  - recentLatency         │    └─────────────────────────────┘
└──────────────────────────┘
```

---

## 1. Context API (`/api/ai/context`)

### 目的
フロントエンドが判断に必要な情報を1回のリクエストで取得する。

### レスポンス
```typescript
type AiContextResponse = {
  // 現在の状態
  flowState: number | null;      // 0-1, 高いほど順調
  wipCount: number;              // SPRINT状態のタスク数

  // 学習データ（過去30日）
  acceptRates: {
    tip: number | null;          // 0-1
    score: number | null;
    split: number | null;
  };

  // 反応パターン
  avgLatencyMs: number | null;   // 平均反応時間

  // 推奨アクション
  recommendations: {
    type: 'TIP' | 'SCORE' | 'SPLIT';
    reason: string;
    confidence: number;          // 0-1
  }[];
};
```

### 実装
```typescript
// app/api/ai/context/route.ts
export async function GET(request: Request) {
  const { userId, workspaceId } = await requireWorkspaceAuth();

  // 1. flow_state を MemoryClaim から取得
  const flowClaim = await prisma.memoryClaim.findFirst({
    where: {
      type: { key: 'flow_state', scope: 'WORKSPACE' },
      workspaceId,
      status: 'ACTIVE',
    },
    orderBy: { updatedAt: 'desc' },
  });

  // 2. WIP数をリアルタイム計算
  const wipCount = await prisma.task.count({
    where: { workspaceId, status: 'SPRINT' },
  });

  // 3. 受容率を MemoryClaim から取得
  const acceptRateClaims = await prisma.memoryClaim.findMany({
    where: {
      userId,
      status: 'ACTIVE',
      type: {
        key: { in: [
          'ai_tip_accept_rate_30d',
          'ai_score_accept_rate_30d',
          'ai_split_accept_rate_30d'
        ] }
      }
    }
  });

  // 4. 平均反応時間
  const avgLatency = await prisma.aiSuggestionReaction.aggregate({
    where: { userId, latencyMs: { not: null } },
    _avg: { latencyMs: true },
  });

  // 5. 推奨を計算
  const recommendations = computeRecommendations({
    flowState: flowClaim?.valueNum,
    wipCount,
    acceptRates,
  });

  return ok({ flowState, wipCount, acceptRates, avgLatencyMs, recommendations });
}
```

---

## 2. Proactive Trigger Logic

### 判定ルール

```typescript
type TriggerCondition = {
  type: 'TIP' | 'SCORE' | 'SPLIT';
  when: (ctx: AiContext, task: TaskDTO) => boolean;
  priority: number;  // 高いほど優先
};

const TRIGGERS: TriggerCondition[] = [
  // SPLIT: 高ポイントタスク
  {
    type: 'SPLIT',
    priority: 100,
    when: (ctx, task) =>
      task.points >= 8 &&
      task.status === 'BACKLOG' &&
      (ctx.acceptRates.split ?? 0.5) >= 0.3,  // 受容率30%以上
  },

  // SCORE: ポイント未設定 or デフォルト値
  {
    type: 'SCORE',
    priority: 80,
    when: (ctx, task) =>
      task.points === 1 &&  // デフォルト値のまま
      task.title.length > 10 &&
      (ctx.acceptRates.score ?? 0.5) >= 0.3,
  },

  // TIP: 説明が空で、flow_stateが低い（詰まってる）
  {
    type: 'TIP',
    priority: 60,
    when: (ctx, task) =>
      (!task.description || task.description.length < 20) &&
      (ctx.flowState ?? 0.5) < 0.4 &&
      (ctx.acceptRates.tip ?? 0.5) >= 0.3,
  },
];
```

### 抑制ルール

```typescript
const SUPPRESS_CONDITIONS = [
  // 受容率が低すぎる → 提案しない
  (ctx: AiContext, type: string) =>
    (ctx.acceptRates[type] ?? 0.5) < 0.2,

  // WIPが多すぎる → 邪魔しない
  (ctx: AiContext) => ctx.wipCount > 5,

  // 最近提案を却下された → クールダウン
  // (別途 lastRejectedAt を追跡)
];
```

---

## 3. Frontend Integration

### useSuggestionContext Hook

```typescript
// app/backlog/hooks/use-suggestion-context.ts
export function useSuggestionContext() {
  const [context, setContext] = useState<AiContext | null>(null);

  // 初回 + 60秒ごとに更新
  useEffect(() => {
    const fetch = async () => {
      const res = await fetch('/api/ai/context');
      if (res.ok) setContext(await res.json());
    };
    fetch();
    const interval = setInterval(fetch, 60_000);
    return () => clearInterval(interval);
  }, []);

  return context;
}
```

### useProactiveSuggestions Hook

```typescript
// app/backlog/hooks/use-proactive-suggestions.ts
export function useProactiveSuggestions(
  task: TaskDTO,
  context: AiContext | null,
) {
  const [triggered, setTriggered] = useState<SuggestionType | null>(null);

  useEffect(() => {
    if (!context) return;

    // 条件を評価
    for (const trigger of TRIGGERS) {
      if (trigger.when(context, task)) {
        setTriggered(trigger.type);
        return;
      }
    }
    setTriggered(null);
  }, [task, context]);

  return triggered;
}
```

### TaskCard での使用

```tsx
// task-card.tsx
function TaskCard({ item }: { item: TaskDTO }) {
  const context = useSuggestionContext();
  const proactiveSuggestion = useProactiveSuggestions(item, context);

  // 自動でフェッチ（表示はしない、準備だけ）
  useEffect(() => {
    if (proactiveSuggestion === 'SPLIT') {
      prefetchSplit(item);  // バックグラウンドで取得
    }
  }, [proactiveSuggestion]);

  return (
    <div>
      {/* proactiveSuggestion があれば控えめなインジケーター */}
      {proactiveSuggestion && (
        <div className="text-xs text-blue-500">
          💡 {proactiveSuggestion} 提案あり
        </div>
      )}
    </div>
  );
}
```

---

## 4. Tracker Context 埋め込み

### 現状の問題
`trackSuggestionViewed()` に context を渡していない。

### 修正

```typescript
// use-ai-suggestions.ts
const estimateScoreForTask = async (item: TaskDTO) => {
  // ...
  const viewedAt = trackSuggestionViewed(data.suggestionId, {
    taskType: item.type,
    taskPoints: item.points,
    hourOfDay: new Date().getHours(),
    dayOfWeek: new Date().getDay(),
    wipCount: context?.wipCount,      // ← 追加
    flowState: context?.flowState,    // ← 追加
  });
};
```

---

## 5. 実装順序

### Step 1: Context API（基盤）
- [ ] `/api/ai/context/route.ts` 作成
- [ ] `useSuggestionContext` hook 作成
- [ ] backlog/page.tsx で context を取得

### Step 2: Tracker 改善
- [ ] tracker に context を渡すよう修正
- [ ] `use-ai-suggestions.ts` で context を受け取る

### Step 3: Proactive Triggers
- [ ] `useProactiveSuggestions` hook 作成
- [ ] TaskCard に控えめなインジケーター追加
- [ ] prefetch ロジック追加

### Step 4: Auto-Apply（高受容率時）
- [ ] 受容率 80%+ かつ latency が短い場合
- [ ] 「自動適用しますか？」の確認モーダル
- [ ] ユーザー設定で ON/OFF

---

## 6. UI/UX 原則

### 邪魔しない
- 提案は**控えめなインジケーター**（点滅しない、色薄め）
- モーダルは開かない、hover や click で展開

### 学習を見せる
- 「あなたは SCORE 提案を 73% 採用しています」
- 「この提案タイプは最近あまり使われていません」

### 主体性を保持
- 自動適用は**オプトイン**
- 「提案を見ない」設定も用意

---

## メトリクス（効果測定）

| 指標 | 計算 | 目標 |
|------|------|------|
| 提案表示率 | VIEWED / 表示可能機会 | 現状比 +50% |
| 受容率 | ACCEPTED / VIEWED | 維持 or 向上 |
| 反応速度 | latencyMs 中央値 | 短縮 |
| 却下後の再提案 | REJECTED → 次回 ACCEPTED | 減少 |
