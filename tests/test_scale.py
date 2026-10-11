"""Opt-in test: an existing 100k-record database, real indexes, real explains."""
import json
import platform
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import main
from tests.test_analytics import log, walk
from tests.test_api import employee

pytestmark = [pytest.mark.integration, pytest.mark.scale]


def test_startup_and_queries_on_one_hundred_thousand_records(mongo):
    first = date(2026, 1, 1)
    employees = [{**employee(f"EMP{i:06d}", department=f"Department {i % 5}", joined_on="2025-01-01"),
                  "created_at": datetime(2025, 1, 1, tzinfo=timezone.utc)} for i in range(1000)]
    mongo.employees.insert_many(employees)
    for offset in range(100):
        day = (first + timedelta(days=offset)).isoformat()
        mongo.attendance_logs.insert_many([log(e["emp_code"], day, hours=8, late=(i % 4) * 15)
                                           for i, e in enumerate(employees)])
    assert mongo.attendance_logs.count_documents({}) == 100000
    assert set(mongo.attendance_logs.index_information()) == {"_id_"}
    started = time.perf_counter()
    measurements = {}
    with TestClient(main.app) as http:
        startup = time.perf_counter() - started
        assert startup < 20
        assert http.get("/health").status_code == 200
        cases = [
            ("attendance_list", "/attendance", {"date_from": "2026-02-01", "date_to": "2026-02-28", "status": "PRESENT", "page": 2, "page_size": 20}),
            ("employee_monthly", "/analytics/employees/EMP000000/monthly", {"month": "2026-02", "emp_code": "EMP000000"}),
            ("department_summary", "/analytics/departments/summary", {"month": "2026-02"}),
            ("late_leaderboard", "/analytics/leaderboard/late", {"month": "2026-02", "limit": 1}),
            ("department_trend", "/analytics/departments/Department 0/trend", {"department": "Department 0", "from": "2026-01-01", "to": "2026-04-02"}),
        ]
        for name, path, params in cases:
            start = time.perf_counter()
            response = http.get(path, params=params)
            elapsed = time.perf_counter() - start
            assert response.status_code == 200, response.text
            body = response.json()
            if name == "attendance_list":
                assert body["total"] == 28000 and len(body["items"]) == 20
            elif name == "employee_monthly":
                assert body["working_days"] == body["present_days"] == 20 and body["attendance_pct"] == 100.0
            elif name == "department_summary":
                assert len(body["items"]) == 5
                assert all(row["headcount"] == 200 and row["present_days"] == 4000 and row["avg_work_hours"] == 8.0 for row in body["items"])
            elif name == "late_leaderboard":
                assert len(body["items"]) == 250 and all(row["rank"] == 1 and row["total_late_minutes"] == 1260 for row in body["items"])
            else:
                assert len(body["items"]) == 92 and all(row["headcount"] == row["present_count"] == 200 for row in body["items"])
                assert all(row["attendance_rate"] == (1.0 if row["is_working_day"] else None) for row in body["items"])
            explained = http.get("/admin/explain/" + name, params=params)
            assert explained.status_code == 200, explained.text
            raw = explained.json()["explain"]
            stages = {entry.get("stage") for entry in walk(raw)}
            assert "IXSCAN" in stages and "COLLSCAN" not in stages
            assert all(entry.get("collectionScans", 0) == 0 for entry in walk(raw))
            measurements[name] = {"wall_time_ms": round(elapsed * 1000, 2),
                                  "has_ixscan": True, "has_collscan": False}
        version = mongo.client.server_info()["version"]
    evidence = {"record_count": 100000, "employee_count": 1000, "mongodb_version": version,
                "python_version": platform.python_version(), "startup_seconds": round(startup, 3),
                "queries": measurements, "measured_at_utc": datetime.now(timezone.utc).isoformat(),
                "note": "One local run, not a production latency guarantee. Data was generated inside the test."}
    destination = Path("test-results")
    destination.mkdir(exist_ok=True)
    (destination / "scale-evidence.json").write_text(json.dumps(evidence, indent=2) + "\n")
