# 個人向け実行AI

`/delegate` で自然文の依頼を受け、永続ジョブを作り、成果物を生成・検証して保存する。
現在の executor は文章の成果物だけを作る。ファイル変更、外部送信、予約、購入、
デプロイなどの実操作は行わない。

## ユーザーとの契約

- 調査・整理・文章作成の安全な依頼は開始でき、再読み込み後もジョブと結果を参照できる。
- 完了条件に対する二回目の検証を通るまで、生成結果を完了として扱わない。
- 外部への影響や破壊的操作を含む依頼には判断を求める。下書きの作成を選んでも、実操作の許可にはならない。
- 認証情報や個人情報などを含むと判定した依頼は、保存・AI送信の前に拒否する。

開始できるかは [domain policy](../modules/delegation/domain/delegation-policy.ts) が決める。
モデルはリスクを下げたり、操作を許可したりできない。

## ジョブの保証

`DelegationJob` は `PENDING` → `RUNNING` を原子的に取得し、所有権 token、有限回の再試行、
滞留回復、終了日時を保持する。実行中にキャンセルしたジョブは、後から provider の応答が
戻っても成功として保存しない。失敗・滞留はヘルスチェックに反映する。

実装は [runner](../modules/delegation/application/delegation-runner.ts)、
[queue](../modules/delegation/infrastructure/d1-delegation-queue.ts)、
[executor](../modules/delegation/infrastructure/ai-delegation-executor.ts) を参照。

実操作を追加する場合は、操作ごとに許可範囲と承認規則、冪等キー、確認可能な実行記録、
timeout・再試行・補償方法を定義した adapter を設ける。
検証はモデルの自己申告ではなく、その実行記録を確認する。
