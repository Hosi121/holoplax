# Oracle extracted without edits from metrics_job.py at 272ee3d. Python 3.12.3
from datetime import datetime, timedelta, timezone
from statistics import median

def now_utc():
    return datetime(2026, 10, 9)

def alpha_for_decay(decay_days: int) -> float:
    return 1 - 2 ** (-1 / max(1, decay_days))

def compute_metrics(tasks: list[dict], window_days: int):
    cutoff = now_utc() - timedelta(days=window_days)
    done_tasks = [
        task
        for task in tasks
        if task["workflowState"] == "DONE"
        and task["doneAt"] is not None
        and task["doneAt"] >= cutoff
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

def compute_flow_state(lead_time_ms: float | None, wip: float, throughput: float):
    if lead_time_ms is None:
        return None
    lead_days = lead_time_ms / (1000 * 60 * 60 * 24)
    if lead_days <= 0:
        return None
    raw = (throughput + 1) / (lead_days + 1) - 0.1 * wip
    return max(0, raw)

if __name__ == "__main__":
    import argparse
    import json
    from pathlib import Path

    parser = argparse.ArgumentParser(description="Verify the frozen Python oracle, without runtime dependencies")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    file = Path(__file__).parent.parent / "modules/metrics/__tests__/python-oracle.json"
    fixture = json.loads(file.read_text())
    frozen_now = datetime.fromtimestamp(fixture["now"] / 1000, timezone.utc)
    now_utc = lambda: frozen_now
    for case in fixture["cases"]:
        tasks = [{key: datetime.fromtimestamp(value / 1000, timezone.utc) if key in ("createdAt", "doneAt", "dueDate") and value is not None else value for key, value in task.items()} for task in case["tasks"]]
        actual = list(compute_metrics(tasks, case["window"]))
        if args.check:
            assert actual == case["expected"], (case["name"], actual, case["expected"])
        case["expected"] = actual
    for case in fixture["flows"]:
        actual = compute_flow_state(*case["args"])
        if args.check:
            assert actual == case["expected"], (case, actual)
        case["expected"] = actual
    for case in fixture["decay"]:
        actual = alpha_for_decay(case["days"])
        if args.check:
            assert actual == case["expected"], (case, actual)
        case["expected"] = actual
    if not args.check:
        file.write_text(json.dumps(fixture, ensure_ascii=False, indent=2) + "\n")
    print("Python oracle: all 16 cases verified" if args.check else "Python oracle regenerated")
