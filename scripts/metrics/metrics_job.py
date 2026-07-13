import os
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from statistics import median

import psycopg


@dataclass(frozen=True)
class MetricSpec:
    key: str
    scope: str
    value_type: str
    granularity: str
    decay_days: int


METRICS = [
    MetricSpec("throughput_14d", "WORKSPACE", "NUMBER", "daily", 14),
    MetricSpec("lead_time_median_30d", "WORKSPACE", "DURATION_MS", "daily", 30),
    MetricSpec("deadline_adherence_30d", "WORKSPACE", "RATIO", "daily", 30),
    MetricSpec("wip_avg_14d", "WORKSPACE", "NUMBER", "daily", 14),
    MetricSpec("throughput_14d", "USER", "NUMBER", "daily", 14),
    MetricSpec("lead_time_median_30d", "USER", "DURATION_MS", "daily", 30),
    MetricSpec("deadline_adherence_30d", "USER", "RATIO", "daily", 30),
    MetricSpec("wip_avg_14d", "USER", "NUMBER", "daily", 14),
    MetricSpec("flow_state", "WORKSPACE", "NUMBER", "daily", 30),
    MetricSpec("ai_trust_state", "WORKSPACE", "NUMBER", "daily", 30),
    # 提案タイプ別の受容率
    MetricSpec("ai_score_accept_rate_30d", "USER", "RATIO", "daily", 30),
    MetricSpec("ai_split_accept_rate_30d", "USER", "RATIO", "daily", 30),
    MetricSpec("ai_tip_accept_rate_30d", "USER", "RATIO", "daily", 30),
    # 修正率（適用したうち修正が入った割合）
    MetricSpec("ai_score_modify_rate_30d", "USER", "RATIO", "daily", 30),
    MetricSpec("ai_split_modify_rate_30d", "USER", "RATIO", "daily", 30),
    # 反応速度（提案表示から反応までの中央値）
    MetricSpec("ai_reaction_latency_p50_30d", "USER", "DURATION_MS", "daily", 30),
]


def now_utc():
    return datetime.utcnow()


def alpha_for_decay(decay_days: int) -> float:
    return 1 - 2 ** (-1 / max(1, decay_days))


def ensure_memory_definitions(conn) -> dict[tuple[str, str], str]:
    definition_ids: dict[tuple[str, str], str] = {}
    with conn.cursor() as cur:
        for spec in METRICS:
            cur.execute(
                """
                SELECT id FROM "MemoryDefinition"
                WHERE key = %s AND scope = %s
                """,
                (spec.key, spec.scope),
            )
            row = cur.fetchone()
            if row:
                definition_ids[(spec.key, spec.scope)] = row[0]
                continue
            new_id = str(uuid.uuid4())
            cur.execute(
                """
                INSERT INTO "MemoryDefinition"
                (id, key, scope, "valueType", granularity, "updatePolicy", "decayDays", "createdAt", "updatedAt")
                VALUES (%s, %s, %s, %s, %s, %s, %s, NOW(), NOW())
                """,
                (
                    new_id,
                    spec.key,
                    spec.scope,
                    spec.value_type,
                    spec.granularity,
                    "derived",
                    spec.decay_days,
                ),
            )
            definition_ids[(spec.key, spec.scope)] = new_id
    conn.commit()
    return definition_ids


def update_metric_and_claim(conn, definition_id: str, scope: str, owner_id: str, value: float | None):
    if value is None:
        return
    window_end = now_utc().replace(hour=0, minute=0, second=0, microsecond=0)
    window_start = window_end - timedelta(days=1)
    with conn.cursor() as cur:
        if scope == "WORKSPACE":
            cur.execute(
                """
                SELECT id, "valueNum" FROM "MemoryMetric"
                WHERE "definitionId" = %s AND "workspaceId" = %s
                  AND "windowStart" = %s AND "windowEnd" = %s
                """,
                (definition_id, owner_id, window_start, window_end),
            )
        else:
            cur.execute(
                """
                SELECT id, "valueNum" FROM "MemoryMetric"
                WHERE "definitionId" = %s AND "userId" = %s
                  AND "windowStart" = %s AND "windowEnd" = %s
                """,
                (definition_id, owner_id, window_start, window_end),
            )
        existing = cur.fetchone()
        if existing:
            cur.execute(
                """
                UPDATE "MemoryMetric"
                SET "valueNum" = %s, "computedAt" = NOW()
                WHERE id = %s
                """,
                (value, existing[0]),
            )
        else:
            if scope == "WORKSPACE":
                cur.execute(
                    """
                    INSERT INTO "MemoryMetric"
                    (id, "definitionId", "workspaceId", "windowStart", "windowEnd", "valueNum", "computedAt")
                    VALUES (%s, %s, %s, %s, %s, %s, NOW())
                    """,
                    (str(uuid.uuid4()), definition_id, owner_id, window_start, window_end, value),
                )
            else:
                cur.execute(
                    """
                    INSERT INTO "MemoryMetric"
                    (id, "definitionId", "userId", "windowStart", "windowEnd", "valueNum", "computedAt")
                    VALUES (%s, %s, %s, %s, %s, %s, NOW())
                    """,
                    (str(uuid.uuid4()), definition_id, owner_id, window_start, window_end, value),
                )

        cur.execute(
            """
            SELECT "decayDays" FROM "MemoryDefinition" WHERE id = %s
            """,
            (definition_id,),
        )
        decay_days = cur.fetchone()[0] or 30
        alpha = alpha_for_decay(decay_days)

        if scope == "WORKSPACE":
            cur.execute(
                """
                SELECT id, "valueNum", "provenance" FROM "MemoryClaim"
                WHERE "definitionId" = %s AND "workspaceId" = %s AND status = 'ACTIVE'
                ORDER BY "updatedAt" DESC
                LIMIT 1
                """,
                (definition_id, owner_id),
            )
        else:
            cur.execute(
                """
                SELECT id, "valueNum", "provenance" FROM "MemoryClaim"
                WHERE "definitionId" = %s AND "userId" = %s AND status = 'ACTIVE'
                ORDER BY "updatedAt" DESC
                LIMIT 1
                """,
                (definition_id, owner_id),
            )
        claim = cur.fetchone()
        if claim:
            # Explicit user input is authoritative. Continue storing the raw
            # metric, but never blend it into a manually confirmed claim.
            if claim[2] == "EXPLICIT":
                conn.commit()
                return
            prev = claim[1] or 0
            next_val = alpha * value + (1 - alpha) * prev
            cur.execute(
                """
                UPDATE "MemoryClaim"
                SET "valueNum" = %s, "updatedAt" = NOW()
                WHERE id = %s
                """,
                (next_val, claim[0]),
            )
        else:
            if scope == "WORKSPACE":
                cur.execute(
                    """
                    INSERT INTO "MemoryClaim"
                    (id, "definitionId", "workspaceId", "valueNum", "provenance", "status", "validFrom", "createdAt", "updatedAt")
                    VALUES (%s, %s, %s, %s, 'INFERRED', 'ACTIVE', NOW(), NOW(), NOW())
                    """,
                    (str(uuid.uuid4()), definition_id, owner_id, value),
                )
            else:
                cur.execute(
                    """
                    INSERT INTO "MemoryClaim"
                    (id, "definitionId", "userId", "valueNum", "provenance", "status", "validFrom", "createdAt", "updatedAt")
                    VALUES (%s, %s, %s, %s, 'INFERRED', 'ACTIVE', NOW(), NOW(), NOW())
                    """,
                    (str(uuid.uuid4()), definition_id, owner_id, value),
                )
    conn.commit()


def compute_metrics(tasks: list[dict], window_days: int):
    cutoff = now_utc() - timedelta(days=window_days)
    done_tasks = [
        task
        for task in tasks
        if task["status"] == "DONE" and task["doneAt"] is not None and task["doneAt"] >= cutoff
    ]
    throughput = len(done_tasks)
    lead_times = [
        (task["doneAt"] - task["createdAt"]).total_seconds() * 1000
        for task in done_tasks
        if task["doneAt"] and task["createdAt"]
    ]
    lead_time_median = median(lead_times) if lead_times else None
    due_tasks = [task for task in done_tasks if task["dueDate"] is not None]
    if due_tasks:
        on_time = sum(1 for task in due_tasks if task["doneAt"] <= task["dueDate"])
        deadline_adherence = on_time / len(due_tasks)
    else:
        deadline_adherence = None
    return throughput, lead_time_median, deadline_adherence


def compute_average_wip(conn, owner_column: str, owner_id: str, days: int = 14) -> float:
    """Time-weighted average number of tasks in SPRINT during the window."""
    if owner_column not in {"workspaceId", "userId"}:
        raise ValueError("invalid owner column")
    window_end = now_utc()
    window_start = window_end - timedelta(days=days)
    with conn.cursor() as cur:
        cur.execute(
            f"""
            WITH ordered AS (
                SELECT e."taskId", e."toStatus", e."createdAt" AS start_at,
                       LEAD(e."createdAt") OVER (
                           PARTITION BY e."taskId" ORDER BY e."createdAt", e.id
                       ) AS end_at
                FROM "TaskStatusEvent" e
                JOIN "Task" t ON t.id = e."taskId"
                WHERE t."{owner_column}" = %s AND e."createdAt" < %s
            ), intervals AS (
                SELECT GREATEST(start_at, %s) AS active_from,
                       LEAST(COALESCE(end_at, %s), %s) AS active_until
                FROM ordered
                WHERE "toStatus" = 'SPRINT'
                  AND COALESCE(end_at, %s) > %s
            )
            SELECT COALESCE(
                SUM(EXTRACT(EPOCH FROM (active_until - active_from))) /
                NULLIF(EXTRACT(EPOCH FROM (%s::timestamp - %s::timestamp)), 0),
                0
            )
            FROM intervals
            WHERE active_until > active_from
            """,
            (
                owner_id,
                window_end,
                window_start,
                window_end,
                window_end,
                window_end,
                window_start,
                window_end,
                window_start,
            ),
        )
        return float(cur.fetchone()[0] or 0)


def compute_flow_state(lead_time_ms: float | None, wip: float, throughput: float):
    if lead_time_ms is None:
        return None
    lead_days = lead_time_ms / (1000 * 60 * 60 * 24)
    if lead_days <= 0:
        return None
    raw = (throughput + 1) / (lead_days + 1) - 0.1 * wip
    return max(0, raw)


def compute_suggestion_metrics_by_type(conn, user_id: str) -> dict:
    """
    タイプ別の受容率・修正率・反応速度を計算する

    Returns:
        dict with keys like ai_{type}_accept_rate_30d, ai_{type}_modify_rate_30d, ai_reaction_latency_p50_30d
    """
    cutoff = now_utc() - timedelta(days=30)

    with conn.cursor() as cur:
        # タイプ別・リアクション別の集計
        cur.execute(
            """
            SELECT
                s.type,
                r.reaction,
                COUNT(*) as count
            FROM "AiSuggestionReaction" r
            JOIN "AiSuggestion" s ON r."suggestionId" = s.id
            WHERE r."userId" = %s AND r."createdAt" >= %s
            GROUP BY s.type, r.reaction
            """,
            (user_id, cutoff),
        )
        rows = cur.fetchall()

        # 反応速度の取得
        cur.execute(
            """
            SELECT "latencyMs"
            FROM "AiSuggestionReaction"
            WHERE "userId" = %s AND "createdAt" >= %s AND "latencyMs" IS NOT NULL
            """,
            (user_id, cutoff),
        )
        latencies = [row[0] for row in cur.fetchall()]

    # タイプ別に集計
    by_type: dict[str, dict[str, int]] = {}
    for suggestion_type, reaction, count in rows:
        if suggestion_type not in by_type:
            by_type[suggestion_type] = {"viewed": 0, "accepted": 0, "modified": 0, "rejected": 0, "ignored": 0}
        by_type[suggestion_type][reaction.lower()] = count

    # 受容率・修正率の計算
    results: dict[str, float | None] = {}
    for stype, counts in by_type.items():
        viewed = counts["viewed"]
        accepted = counts["accepted"]
        modified = counts["modified"]
        if viewed > 0:
            accept_rate = (accepted + modified) / viewed
            results[f"ai_{stype.lower()}_accept_rate_30d"] = accept_rate
        if (accepted + modified) > 0:
            modify_rate = modified / (accepted + modified)
            results[f"ai_{stype.lower()}_modify_rate_30d"] = modify_rate

    # 反応速度の中央値
    if latencies:
        results["ai_reaction_latency_p50_30d"] = median(latencies)

    return results


def compute_ai_trust_state(conn, workspace_id: str) -> float | None:
    cutoff = now_utc() - timedelta(days=30)
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT COUNT(*) FROM "AiSuggestion"
            WHERE "workspaceId" = %s AND "createdAt" >= %s
            """,
            (workspace_id, cutoff),
        )
        suggestion_count = cur.fetchone()[0] or 0
        cur.execute(
            """
            SELECT COUNT(*) FROM "AiPrepOutput"
            WHERE "workspaceId" = %s AND "createdAt" >= %s
            """,
            (workspace_id, cutoff),
        )
        prep_count = cur.fetchone()[0] or 0
        cur.execute(
            """
            SELECT COUNT(*) FROM "AuditLog"
            WHERE "targetWorkspaceId" = %s
              AND "createdAt" >= %s
              AND "action" = 'AI_APPLY'
            """,
            (workspace_id, cutoff),
        )
        apply_count = cur.fetchone()[0] or 0
        cur.execute(
            """
            SELECT COUNT(*) FROM "AiPrepOutput"
            WHERE "workspaceId" = %s AND "updatedAt" >= %s AND status = 'APPLIED'
            """,
            (workspace_id, cutoff),
        )
        prep_applied = cur.fetchone()[0] or 0

    total_outputs = suggestion_count + prep_count
    total_applies = apply_count + prep_applied
    if total_outputs <= 0:
        return None
    return min(1.0, total_applies / total_outputs)


def fetch_tasks(conn, owner_column: str, owner_id: str):
    if owner_column not in {"workspaceId", "userId"}:
        raise ValueError("invalid owner column")
    with conn.cursor() as cur:
        cur.execute(
            f"""
            SELECT t.id, t."createdAt", t.status, t.points, t."dueDate",
                   (
                       SELECT MAX(e."createdAt")
                       FROM "TaskStatusEvent" e
                       WHERE e."taskId" = t.id AND e."toStatus" = 'DONE'
                   ) AS "doneAt"
            FROM "Task" t
            WHERE t."{owner_column}" = %s
            """,
            (owner_id,),
        )
        columns = [desc[0] for desc in cur.description]
        return [dict(zip(columns, row)) for row in cur.fetchall()]


def main():
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is required")

    with psycopg.connect(database_url) as conn:
        definition_ids = ensure_memory_definitions(conn)

        with conn.cursor() as cur:
            cur.execute('SELECT id FROM "Workspace"')
            workspaces = [row[0] for row in cur.fetchall()]
            cur.execute('SELECT id FROM "User"')
            users = [row[0] for row in cur.fetchall()]

        for workspace_id in workspaces:
            tasks = fetch_tasks(conn, "workspaceId", workspace_id)
            throughput, lead_time, adherence = compute_metrics(tasks, 30)
            throughput_14, _, _ = compute_metrics(tasks, 14)
            wip = compute_average_wip(conn, "workspaceId", workspace_id)
            flow = compute_flow_state(lead_time, wip, throughput_14)

            update_metric_and_claim(
                conn,
                definition_ids[("throughput_14d", "WORKSPACE")],
                "WORKSPACE",
                workspace_id,
                float(throughput_14),
            )
            update_metric_and_claim(
                conn,
                definition_ids[("lead_time_median_30d", "WORKSPACE")],
                "WORKSPACE",
                workspace_id,
                float(lead_time) if lead_time is not None else None,
            )
            update_metric_and_claim(
                conn,
                definition_ids[("deadline_adherence_30d", "WORKSPACE")],
                "WORKSPACE",
                workspace_id,
                float(adherence) if adherence is not None else None,
            )
            update_metric_and_claim(
                conn,
                definition_ids[("wip_avg_14d", "WORKSPACE")],
                "WORKSPACE",
                workspace_id,
                float(wip),
            )
            update_metric_and_claim(
                conn,
                definition_ids[("flow_state", "WORKSPACE")],
                "WORKSPACE",
                workspace_id,
                float(flow) if flow is not None else None,
            )

        for user_id in users:
            tasks = fetch_tasks(conn, "userId", user_id)
            throughput, lead_time, adherence = compute_metrics(tasks, 30)
            throughput_14, _, _ = compute_metrics(tasks, 14)
            wip = compute_average_wip(conn, "userId", user_id)

            update_metric_and_claim(
                conn,
                definition_ids[("throughput_14d", "USER")],
                "USER",
                user_id,
                float(throughput_14),
            )
            update_metric_and_claim(
                conn,
                definition_ids[("lead_time_median_30d", "USER")],
                "USER",
                user_id,
                float(lead_time) if lead_time is not None else None,
            )
            update_metric_and_claim(
                conn,
                definition_ids[("deadline_adherence_30d", "USER")],
                "USER",
                user_id,
                float(adherence) if adherence is not None else None,
            )
            update_metric_and_claim(
                conn,
                definition_ids[("wip_avg_14d", "USER")],
                "USER",
                user_id,
                float(wip),
            )

            # 提案タイプ別メトリクス
            suggestion_metrics = compute_suggestion_metrics_by_type(conn, user_id)
            for metric_key, value in suggestion_metrics.items():
                if (metric_key, "USER") in definition_ids and value is not None:
                    update_metric_and_claim(
                        conn,
                        definition_ids[(metric_key, "USER")],
                        "USER",
                        user_id,
                        float(value),
                    )

        # AI trust is derived from recent generated and applied outputs.
        for workspace_id in workspaces:
            update_metric_and_claim(
                conn,
                definition_ids[("ai_trust_state", "WORKSPACE")],
                "WORKSPACE",
                workspace_id,
                compute_ai_trust_state(conn, workspace_id),
            )


if __name__ == "__main__":
    main()
