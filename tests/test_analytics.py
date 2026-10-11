"""Expected results are hand-calculated; stored values deliberately vary from punches."""
from datetime import datetime, timezone

import pytest

from app.main import instant
from tests.test_api import employee
from tests.test_rules import stamp

pytestmark = pytest.mark.integration


def log(code, day, status="PRESENT", hours=None, late=0, overtime=0, half=False):
    return {"emp_code": code, "date": day, "status": status,
            "punch_in": instant(stamp(day + "T09:30:00")) if status in ("PRESENT", "WFH", "ON_DUTY") else None,
            "punch_out": None, "work_hours": hours, "late_minutes": late,
            "overtime_minutes": overtime, "half_day": half}


@pytest.fixture
def reports(api):
    http, db = api
    rows = [
        ("EMP1001", "Ana", "Ops", "2026-07-01"),
        ("EMP1002", "Ben", "Ops", "2026-07-15"),
        ("EMP1003", "Cy", "Ops", "2026-08-01"),
        ("EMP1004", "Dia", "Design", "2026-07-01"),
        ("EMP1005", "Eno", "Ops", "2026-07-01"),
        ("EMP1006", "Flo", "Ops", "2026-07-01"),
        ("EMP1007", "Gia", "Empty", "2026-07-01"),
    ]
    for code, name, department, joined in rows:
        assert http.post("/employees", json=employee(code, name=name, department=department, joined_on=joined)).status_code == 201
    db.attendance_logs.insert_many([
        log("EMP1001", "2026-07-06", hours=8, late=30, overtime=29),
        log("EMP1001", "2026-07-07", "WFH", hours=3, late=10, half=True),
        log("EMP1001", "2026-07-11", "ON_DUTY", hours=2, late=20, overtime=60, half=True),
        log("EMP1001", "2026-07-08", "LEAVE"),
        log("EMP1002", "2026-07-15", hours=10, late=60),
        log("EMP1006", "2026-07-06", hours=6, late=60),
        log("EMP1004", "2026-07-06", hours=4, late=90),
        log("EMP9999", "2026-07-06", hours=20, late=1000),  # Orphan: no matching employee.
    ])
    return http, db


def test_monthly_weekdays_stored_values_and_joiners(reports):
    http, _ = reports
    response = http.get("/analytics/employees/EMP1001/monthly", params={"month": "2026-07"})
    assert response.status_code == 200, response.text
    assert response.json() == {"emp_code": "EMP1001", "month": "2026-07", "working_days": 23,
        "present_days": 1.5, "leave_days": 1, "late_count": 3, "total_late_minutes": 60,
        "total_overtime_minutes": 89, "attendance_pct": 6.52}
    ben = http.get("/analytics/employees/EMP1002/monthly", params={"month": "2026-07"}).json()
    assert ben["working_days"] == 13 and ben["attendance_pct"] == 7.69
    empty = http.get("/analytics/employees/EMP1005/monthly", params={"month": "2026-07"}).json()
    assert empty["present_days"] == empty["leave_days"] == empty["attendance_pct"] == 0
    future = http.get("/analytics/employees/EMP1003/monthly", params={"month": "2026-07"}).json()
    assert future["working_days"] == 0 and future["attendance_pct"] is None
    assert http.get("/analytics/employees/EMP9999/monthly", params={"month": "2026-07"}).status_code == 404


def test_department_headcount_includes_no_logs_and_averages_records(reports):
    http, _ = reports
    response = http.get("/analytics/departments/summary", params={"month": "2026-07"})
    assert response.status_code == 200, response.text
    items = response.json()["items"]
    assert [row["department"] for row in items] == ["Design", "Empty", "Ops"]
    assert items[2] == {"department": "Ops", "headcount": 4, "present_days": 3.5, "avg_work_hours": 5.8,
        "late_count": 5, "total_late_minutes": 180, "leave_count": 1, "on_duty_count": 1}
    assert items[1]["headcount"] == 1 and items[1]["avg_work_hours"] is None
    assert http.get("/analytics/departments/summary", params={"month": "2026-06"}).json()["items"] == []
    assert http.get("/analytics/departments/summary", params={"month": "2026-07", "department": "ops"}).json()["items"] == []


def test_ranks_ties_cutoff_and_department_filter(reports):
    http, _ = reports
    params = {"month": "2026-07", "limit": 2}
    response = http.get("/analytics/leaderboard/late", params=params)
    assert response.status_code == 200, response.text
    items = response.json()["items"]
    assert [(row["emp_code"], row["rank"]) for row in items] == [
        ("EMP1004", 1), ("EMP1001", 2), ("EMP1002", 2), ("EMP1006", 2)]
    inside = http.get("/analytics/leaderboard/late", params={"month": "2026-07", "department": "Ops", "limit": 1}).json()["items"]
    assert len(inside) == 3 and all(row["rank"] == 1 for row in inside)
    assert http.get("/analytics/leaderboard/late", params={"month": "2026-08"}).json()["items"] == []


def test_rank_gap_is_not_dense_rank(reports):
    http, db = reports
    db.attendance_logs.insert_one(log("EMP1005", "2026-07-06", late=20))
    items = http.get("/analytics/leaderboard/late", params={"month": "2026-07", "limit": 5}).json()["items"]
    assert [row["rank"] for row in items] == [1, 2, 2, 2, 5]
    cutoff = http.get("/analytics/leaderboard/late", params={"month": "2026-07", "limit": 4}).json()["items"]
    assert len(cutoff) == 4


def test_trend_gaps_weekends_short_windows_and_half_days(reports):
    http, _ = reports
    response = http.get("/analytics/departments/Ops/trend", params={"from": "2026-07-06", "to": "2026-07-13"})
    assert response.status_code == 200, response.text
    items = response.json()["items"]
    assert [row["date"] for row in items] == [f"2026-07-{day:02d}" for day in range(6, 14)]
    assert [row["attendance_rate"] for row in items] == [0.6667, 0.1667, 0.0, 0.0, 0.0, None, None, 0.0]
    assert [row["moving_avg_7d"] for row in items] == [0.6667, 0.4167, 0.2778, 0.2084, 0.1667, 0.1667, 0.1667, 0.0333]
    assert items[5]["present_count"] == 0.5 and items[5]["late_count"] == 1
    assert all(row["headcount"] == 3 for row in items)
    short = http.get("/analytics/departments/Ops/trend", params={"from": "2026-07-07", "to": "2026-07-07"}).json()["items"]
    assert short[0]["moving_avg_7d"] == 0.1667  # No rate from the preceding day leaks in.


def test_trend_no_logs_zero_headcount_mid_range_join_and_unknown(reports):
    http, _ = reports
    before = http.get("/analytics/departments/Ops/trend", params={"from": "2026-06-29", "to": "2026-07-02"}).json()["items"]
    assert [row["headcount"] for row in before] == [0, 0, 3, 3]
    assert [row["attendance_rate"] for row in before] == [None, None, 0.0, 0.0]
    no_logs = http.get("/analytics/departments/Empty/trend", params={"from": "2026-07-10", "to": "2026-07-12"}).json()["items"]
    assert len(no_logs) == 3 and [row["attendance_rate"] for row in no_logs] == [0.0, None, None]
    weekend = http.get("/analytics/departments/Empty/trend", params={"from": "2026-07-11", "to": "2026-07-12"}).json()["items"]
    assert all(row["moving_avg_7d"] is None for row in weekend)
    joined = http.get("/analytics/departments/Ops/trend", params={"from": "2026-07-14", "to": "2026-07-15"}).json()["items"]
    assert [row["headcount"] for row in joined] == [3, 4]
    assert joined[1]["attendance_rate"] == 0.25
    assert http.get("/analytics/departments/Missing/trend", params={"from": "2026-07-01", "to": "2026-07-01"}).status_code == 404


@pytest.mark.parametrize("first,last,expected", [("2026-07-02", "2026-07-01", 422),
    ("2026-01-01", "2026-04-02", 200), ("2026-01-01", "2026-04-03", 422)])
def test_inclusive_trend_range_limit(reports, first, last, expected):
    http, _ = reports
    assert http.get("/analytics/departments/Ops/trend", params={"from": first, "to": last}).status_code == expected


def test_decimal_half_up_report_rounding(api):
    http, db = api
    for i in range(32):
        assert http.post("/employees", json=employee(f"EMP{2000+i}", department="Rounding")).status_code == 201
    db.attendance_logs.insert_many([log("EMP2000", "2026-07-06", hours=2.00), log("EMP2000", "2026-07-07", hours=5.01)])
    item = http.get("/analytics/departments/summary", params={"month": "2026-07"}).json()["items"][0]
    assert item["avg_work_hours"] == 3.51  # 3.505 rounds upward, not to even.
    day = http.get("/analytics/departments/Rounding/trend", params={"from": "2026-07-06", "to": "2026-07-06"}).json()["items"][0]
    assert day["attendance_rate"] == 0.0313  # 1/32 = 0.03125.


EXPLAIN_CASES = [
    ("attendance_list", {"emp_code": "EMP1001", "date_from": "2026-07-01", "page_size": 2}),
    ("employee_monthly", {"emp_code": "EMP1001", "month": "2026-07"}),
    ("department_summary", {"month": "2026-07", "department": "Ops"}),
    ("late_leaderboard", {"month": "2026-07", "limit": 2}),
    ("department_trend", {"department": "Ops", "from": "2026-07-06", "to": "2026-07-13"}),
]


def walk(value):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from walk(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk(child)


@pytest.mark.parametrize("endpoint,params", EXPLAIN_CASES)
def test_explain_uses_real_matching_queries_and_indexes(reports, endpoint, params):
    http, _ = reports
    response = http.get("/admin/explain/" + endpoint, params=params)
    assert response.status_code == 200, response.text
    result = response.json()
    stages = [item.get("stage") for item in walk(result["explain"])]
    assert "IXSCAN" in stages and "COLLSCAN" not in stages
    assert all(item.get("collectionScans", 0) == 0 for item in walk(result["explain"]))
    assert result["endpoint"] == endpoint
    if endpoint == "attendance_list":
        command = result["explain"]["command"]
        assert command["limit"] == 2 and command["sort"] == {"date": -1, "emp_code": 1}
        assert command["filter"]["emp_code"] == "EMP1001"


@pytest.mark.parametrize("endpoint", ["employee_monthly", "department_summary", "late_leaderboard", "department_trend", "unknown"])
def test_explain_missing_inputs_are_422(api, endpoint):
    assert api[0].get("/admin/explain/" + endpoint).status_code == 422
