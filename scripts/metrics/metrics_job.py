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
]


def now_utc():
    return datetime.utcnow()


def alpha_for_decay(decay_days: int) -> float:
    return 1 - 2 ** (-1 / max(1, decay_days))


def ensure_memory_types(conn) -> dict[tuple[str, str], str]:
    type_ids: dict[tuple[str, str], str] = {}
    with conn.cursor() as cur:
        for spec in METRICS:
            cur.execute(
                """
                SELECT id FROM "MemoryType"
                WHERE key = %s AND scope = %s
                """,
                (spec.key, spec.scope),
            )
            row = cur.fetchone()
            if row:
                type_ids[(spec.key, spec.scope)] = row[0]
                continue
            new_id = str(uuid.uuid4())
            cur.execute(
                """
                INSERT INTO "MemoryType"
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
            type_ids[(spec.key, spec.scope)] = new_id
    conn.commit()
    return type_ids


def update_metric_and_claim(conn, type_id: str, scope: str, owner_id: str, value: float | None):
    if value is None:
        return
    window_end = now_utc()
    window_start = window_end - timedelta(days=1)
    with conn.cursor() as cur:
        if scope == "WORKSPACE":
            cur.execute(
                """
                SELECT id, "valueNum" FROM "MemoryMetric"
                WHERE "typeId" = %s AND "workspaceId" = %s
                  AND "windowStart" = %s AND "windowEnd" = %s
                """,
                (type_id, owner_id, window_start, window_end),
            )
        else:
            cur.execute(
                """
                SELECT id, "valueNum" FROM "MemoryMetric"
                WHERE "typeId" = %s AND "userId" = %s
                  AND "windowStart" = %s AND "windowEnd" = %s
                """,
                (type_id, owner_id, window_start, window_end),
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
                    (id, "typeId", "workspaceId", "windowStart", "windowEnd", "valueNum", "computedAt")
                    VALUES (%s, %s, %s, %s, %s, %s, NOW())
                    """,
                    (str(uuid.uuid4()), type_id, owner_id, window_start, window_end, value),
                )
            else:
                cur.execute(
                    """
                    INSERT INTO "MemoryMetric"
                    (id, "typeId", "userId", "windowStart", "windowEnd", "valueNum", "computedAt")
                    VALUES (%s, %s, %s, %s, %s, %s, NOW())
                    """,
                    (str(uuid.uuid4()), type_id, owner_id, window_start, window_end, value),
                )

        cur.execute(
            """
            SELECT "decayDays" FROM "MemoryType" WHERE id = %s
            """,
            (type_id,),
        )
        decay_days = cur.fetchone()[0] or 30
        alpha = alpha_for_decay(decay_days)

        if scope == "WORKSPACE":
            cur.execute(
                """
                SELECT id, "valueNum" FROM "MemoryClaim"
                WHERE "typeId" = %s AND "workspaceId" = %s AND status = 'ACTIVE'
                ORDER BY "updatedAt" DESC
                LIMIT 1
                """,
                (type_id, owner_id),
            )
        else:
            cur.execute(
                """
                SELECT id, "valueNum" FROM "MemoryClaim"
                WHERE "typeId" = %s AND "userId" = %s AND status = 'ACTIVE'
                ORDER BY "updatedAt" DESC
                LIMIT 1
                """,
                (type_id, owner_id),
            )
        claim = cur.fetchone()
        if claim:
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
                    (id, "typeId", "workspaceId", "valueNum", "source", "status", "createdAt", "updatedAt")
                    VALUES (%s, %s, %s, %s, 'INFERRED', 'ACTIVE', NOW(), NOW())
                    """,
                    (str(uuid.uuid4()), type_id, owner_id, value),
                )
            else:
                cur.execute(
                    """
                    INSERT INTO "MemoryClaim"
                    (id, "typeId", "userId", "valueNum", "source", "status", "createdAt", "updatedAt")
                    VALUES (%s, %s, %s, %s, 'INFERRED', 'ACTIVE', NOW(), NOW())
                    """,
                    (str(uuid.uuid4()), type_id, owner_id, value),
                )
    conn.commit()


def compute_metrics(tasks: list[dict], window_days: int):
    cutoff = now_utc() - timedelta(days=window_days)
    done_tasks = [
        task for task in tasks if task["status"] == "DONE" and task["updatedAt"] >= cutoff
    ]
    throughput = len(done_tasks)
    lead_times = [
        (task["updatedAt"] - task["createdAt"]).total_seconds() * 1000
        for task in done_tasks
        if task["updatedAt"] and task["createdAt"]
    ]
    lead_time_median = median(lead_times) if lead_times else None
    due_tasks = [task for task in done_tasks if task["dueDate"] is not None]
    if due_tasks:
        on_time = sum(1 for task in due_tasks if task["updatedAt"] <= task["dueDate"])
        deadline_adherence = on_time / len(due_tasks)
    else:
        deadline_adherence = None
    return throughput, lead_time_median, deadline_adherence


def compute_wip(tasks: list[dict]):
    return sum(1 for task in tasks if task["status"] == "SPRINT")


def compute_flow_state(lead_time_ms: float | None, wip: float, throughput: float):
    if lead_time_ms is None:
        return None
    lead_days = lead_time_ms / (1000 * 60 * 60 * 24)
    if lead_days <= 0:
        return None
    raw = (throughput + 1) / (lead_days + 1) - 0.1 * wip
    return max(0, raw)


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


def fetch_tasks(conn, where_clause: str, params: tuple):
    with conn.cursor() as cur:
        cur.execute(
            f"""
            SELECT id, "createdAt", "updatedAt", status, points, "dueDate"
            FROM "Task"
            WHERE {where_clause}
            """,
            params,
        )
        columns = [desc[0] for desc in cur.description]
        return [dict(zip(columns, row)) for row in cur.fetchall()]


def main():
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is required")

    with psycopg.connect(database_url) as conn:
        type_ids = ensure_memory_types(conn)

        with conn.cursor() as cur:
            cur.execute('SELECT id FROM "Workspace"')
            workspaces = [row[0] for row in cur.fetchall()]
            cur.execute('SELECT id FROM "User"')
            users = [row[0] for row in cur.fetchall()]

        for workspace_id in workspaces:
            tasks = fetch_tasks(conn, '"workspaceId" = %s', (workspace_id,))
            throughput, lead_time, adherence = compute_metrics(tasks, 30)
            throughput_14, _, _ = compute_metrics(tasks, 14)
            wip = compute_wip(tasks)
            flow = compute_flow_state(lead_time, wip, throughput_14)

            update_metric_and_claim(
                conn,
                type_ids[("throughput_14d", "WORKSPACE")],
                "WORKSPACE",
                workspace_id,
                float(throughput_14),
            )
            update_metric_and_claim(
                conn,
                type_ids[("lead_time_median_30d", "WORKSPACE")],
                "WORKSPACE",
                workspace_id,
                float(lead_time) if lead_time is not None else None,
            )
            update_metric_and_claim(
                conn,
                type_ids[("deadline_adherence_30d", "WORKSPACE")],
                "WORKSPACE",
                workspace_id,
                float(adherence) if adherence is not None else None,
            )
            update_metric_and_claim(
                conn,
                type_ids[("wip_avg_14d", "WORKSPACE")],
                "WORKSPACE",
                workspace_id,
                float(wip),
            )
            update_metric_and_claim(
                conn,
                type_ids[("flow_state", "WORKSPACE")],
                "WORKSPACE",
                workspace_id,
                float(flow) if flow is not None else None,
            )

        for user_id in users:
            tasks = fetch_tasks(conn, '"userId" = %s', (user_id,))
            throughput, lead_time, adherence = compute_metrics(tasks, 30)
            throughput_14, _, _ = compute_metrics(tasks, 14)
            wip = compute_wip(tasks)

            update_metric_and_claim(
                conn,
                type_ids[("throughput_14d", "USER")],
                "USER",
                user_id,
                float(throughput_14),
            )
            update_metric_and_claim(
                conn,
                type_ids[("lead_time_median_30d", "USER")],
                "USER",
                user_id,
                float(lead_time) if lead_time is not None else None,
            )
            update_metric_and_claim(
                conn,
                type_ids[("deadline_adherence_30d", "USER")],
                "USER",
                user_id,
                float(adherence) if adherence is not None else None,
            )
            update_metric_and_claim(
                conn,
                type_ids[("wip_avg_14d", "USER")],
                "USER",
                user_id,
                float(wip),
            )

        # Placeholder for AI trust state until approval/apply logs exist.
        for workspace_id in workspaces:
            update_metric_and_claim(
                conn,
                type_ids[("ai_trust_state", "WORKSPACE")],
                "WORKSPACE",
                workspace_id,
                compute_ai_trust_state(conn, workspace_id),
            )


if __name__ == "__main__":
    main()
