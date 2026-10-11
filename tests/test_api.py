from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from threading import Barrier
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from pymongo.errors import ServerSelectionTimeoutError

from app import main
from tests.test_rules import stamp

pytestmark = pytest.mark.integration


def employee(code="EMP0001", **updates):
    return {"emp_code": code, "name": "Test Person", "email": code.lower() + "@example.com",
            "department": "Engineering", "joined_on": "2026-01-01", **updates}


def setup_day(http, code="EMP0001", clock="2026-07-06T09:30:00", **settings):
    assert http.post("/employees", json=employee(code, **settings)).status_code == 201
    response = http.post("/attendance/punch-in", json={"emp_code": code, "punched_at": stamp(clock)})
    assert response.status_code == 201, response.text
    return response.json()


def test_employee_race_filter_order_and_pagination(api):
    http, db = api
    with ThreadPoolExecutor(max_workers=8) as pool:
        statuses = list(pool.map(lambda _: http.post("/employees", json=employee()).status_code, range(8)))
    assert sorted(statuses) == [201] + [409] * 7
    assert db.employees.count_documents({}) == 1
    for code, department in [("EMP0003", "Sales"), ("EMP0002", "Engineering")]:
        assert http.post("/employees", json=employee(code, department=department)).status_code == 201
    first = http.get("/employees", params={"department": "Engineering", "page_size": 1}).json()
    second = http.get("/employees", params={"department": "Engineering", "page_size": 1, "page": 2}).json()
    assert first["total"] == second["total"] == 2
    assert first["items"][0]["emp_code"] == "EMP0001"
    assert second["items"][0]["emp_code"] == "EMP0002"
    assert isinstance(first["items"][0]["created_at"], int)
    assert "_id" not in first["items"][0]
    assert http.get("/employees", params={"department": "engineering"}).json()["total"] == 0


@pytest.mark.parametrize("changes", [{"emp_code": "x"}, {"emp_code": "EMP0000001"}, {"name": ""},
    {"email": "bad@address"}, {"department": "x" * 51}, {"shift_start": "9:30"},
    {"shift_end": "24:00"}, {"joined_on": "2026-02-30"}, {"shift_start": "18:30"}])
def test_employee_validation(api, changes):
    http, _ = api
    assert http.post("/employees", json=employee(**changes)).status_code == 422


@pytest.mark.parametrize("path,params", [("/employees", {"page": 0}), ("/employees", {"page_size": 101}),
    ("/attendance", {"page_size": 0}), ("/attendance", {"status": "SICK"}),
    ("/attendance", {"date_from": "2026-07-02", "date_to": "2026-07-01"}),
    ("/attendance", {"date_from": "2026-02-30"}),
    ("/analytics/departments/summary", {"month": "2026-13"}),
    ("/analytics/leaderboard/late", {"month": "2026-07", "limit": 51})])
def test_query_validation(api, path, params):
    assert api[0].get(path, params=params).status_code == 422


def test_punch_in_race_and_bson_storage(api):
    http, db = api
    assert http.post("/employees", json=employee()).status_code == 201
    request = {"emp_code": "EMP0001", "punched_at": stamp("2026-07-06T09:40:01.900"),
               "late_minutes": 999, "half_day": True, "history": [{"fake": True}], "status": "WFH"}
    with ThreadPoolExecutor(max_workers=12) as pool:
        responses = list(pool.map(lambda _: http.post("/attendance/punch-in", json=request), range(12)))
    assert sorted(r.status_code for r in responses) == [201] + [409] * 11
    row = next(r.json() for r in responses if r.status_code == 201)
    assert row["late_minutes"] == 10 and row["punch_in"] % 1000 == 0
    assert row["history"] == [] and row["half_day"] is False
    assert "id" not in row and "_id" not in row
    assert isinstance(db.attendance_logs.find_one()["punch_in"], datetime)


def test_unknown_employee_and_bad_punches(api):
    http, _ = api
    for path in ("punch-in", "punch-out"):
        assert http.post("/attendance/" + path, json={"emp_code": "EMP4040"}).status_code == 404
        for invalid in (None, True, "1783312500000", 1783312500, 1783312500000.5):
            assert http.post("/attendance/" + path, json={"emp_code": "EMP4040", "punched_at": invalid}).status_code == 422
    for status in ("ABSENT", "LEAVE", "present"):
        assert http.post("/attendance/punch-in", json={"emp_code": "EMP4040", "status": status}).status_code == 422


def test_concurrent_punch_out_has_one_winner_and_no_history(api):
    http, db = api
    setup_day(http)
    with ThreadPoolExecutor(max_workers=12) as pool:
        responses = list(pool.map(lambda _: http.post("/attendance/punch-out",
            json={"emp_code": "EMP0001", "punched_at": stamp("2026-07-06T19:00:00")}), range(12)))
    assert sorted(r.status_code for r in responses) == [200] + [409] * 11
    row = next(r.json() for r in responses if r.status_code == 200)
    assert row["work_hours"] == 9.5 and row["overtime_minutes"] == 30 and row["history"] == []
    assert db.attendance_logs.count_documents({}) == 1


def test_overnight_and_after_midnight_punch_in(api):
    http, _ = api
    setup_day(http, clock="2026-07-07T01:10:00", shift_start="22:00", shift_end="06:00")
    response = http.post("/attendance/punch-out", json={"emp_code": "EMP0001", "punched_at": stamp("2026-07-07T06:40:00")})
    assert response.status_code == 200
    row = response.json()
    assert (row["date"], row["late_minutes"], row["overtime_minutes"], row["work_hours"]) == ("2026-07-06", 190, 40, 5.5)


def test_punch_out_selects_latest_record_even_if_it_is_closed(api):
    http, _ = api
    setup_day(http)
    assert http.post("/attendance/punch-in", json={"emp_code": "EMP0001", "punched_at": stamp("2026-07-07T09:30:00")}).status_code == 201
    body = {"emp_code": "EMP0001", "punched_at": stamp("2026-07-07T18:30:00")}
    assert http.post("/attendance/punch-out", json=body).status_code == 200
    assert http.post("/attendance/punch-out", json=body).status_code == 409


@pytest.mark.parametrize("end,expected", [("2026-07-06T09:29:59", 404), ("2026-07-06T09:30:00", 422),
    ("2026-07-07T09:30:00", 200), ("2026-07-07T09:30:01", 422)])
def test_punch_out_duration_boundaries(api, end, expected):
    http, _ = api
    setup_day(http)
    assert http.post("/attendance/punch-out", json={"emp_code": "EMP0001", "punched_at": stamp(end)}).status_code == expected


def test_regularization_history_and_noop(api):
    http, db = api
    setup_day(http, clock="2026-07-06T10:05:00")
    assert http.post("/attendance/punch-out", json={"emp_code": "EMP0001", "punched_at": stamp("2026-07-06T18:30:00")}).status_code == 200
    body = {"punch_in": stamp("2026-07-06T09:28:00"), "reason": "Clock was wrong", "regularized_by": "HR"}
    response = http.patch("/attendance/EMP0001/2026-07-06", json=body)
    assert response.status_code == 200, response.text
    row = response.json()
    assert row["late_minutes"] == 0 and row["work_hours"] == 9.03
    assert set(row["history"][0]["changes"]) == {"punch_in", "work_hours", "late_minutes"}
    assert isinstance(row["history"][0]["changes"]["punch_in"]["from"], int)
    stored = db.attendance_logs.find_one()
    assert isinstance(stored["history"][0]["changes"]["punch_in"]["from"], datetime)
    assert http.patch("/attendance/EMP0001/2026-07-06", json=body).status_code == 422
    body = {"status": "LEAVE", "reason": "Approved leave", "regularized_by": "HR"}
    row = http.patch("/attendance/EMP0001/2026-07-06", json=body).json()
    assert row["punch_in"] is None and row["punch_out"] is None and row["work_hours"] is None
    assert row["late_minutes"] == row["overtime_minutes"] == 0 and row["half_day"] is False
    assert len(row["history"]) == 2


@pytest.mark.parametrize("updates", [{"status": "ABSENT", "punch_in": stamp("2026-07-06T09:30:00")},
    {"punch_in": stamp("2026-07-07T09:30:00")}, {"punch_out": stamp("2026-07-06T09:30:00")},
    {"punch_out": stamp("2026-07-07T09:30:01")}, {"punch_in": None}, {"punch_out": None},
    {"reason": "x"}, {"regularized_by": ""}, {"late_minutes": 999}, {}])
def test_invalid_corrections_do_not_write(api, updates):
    http, db = api
    setup_day(http)
    response = http.patch("/attendance/EMP0001/2026-07-06", json={"reason": "Fix clock", "regularized_by": "HR", **updates})
    assert response.status_code == 422, response.text
    assert db.attendance_logs.find_one()["history"] == []


def test_legacy_correction_and_absent_to_present(api):
    http, db = api
    setup_day(http)
    db.attendance_logs.update_one({}, {"$unset": {"history": "", "half_day": ""}})
    body = {"status": "ABSENT", "reason": "Wrong employee", "regularized_by": "HR"}
    assert http.patch("/attendance/EMP0001/2026-07-06", json=body).status_code == 200
    body["status"] = "PRESENT"
    assert http.patch("/attendance/EMP0001/2026-07-06", json=body).status_code == 422
    body["punch_in"] = stamp("2026-07-06T09:30:00")
    response = http.patch("/attendance/EMP0001/2026-07-06", json=body)
    assert response.status_code == 200 and len(response.json()["history"]) == 2


def test_concurrent_corrections_use_compare_and_set(api, monkeypatch):
    http, db = api
    setup_day(http)
    barrier = Barrier(2)
    original_filter = main.unchanged_filter

    def synchronized_filter(document):
        query = original_filter(document)
        barrier.wait(timeout=5)
        return query

    monkeypatch.setattr(main, "unchanged_filter", synchronized_filter)
    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(lambda status: http.patch("/attendance/EMP0001/2026-07-06",
            json={"status": status, "reason": "Approved change", "regularized_by": status}), ["WFH", "ON_DUTY"]))
    assert sorted(r.status_code for r in responses) == [200, 409]
    row = db.attendance_logs.find_one()
    assert len(row["history"]) == 1
    assert row["history"][0]["changes"]["status"]["from"] == "PRESENT"


def test_attendance_filters_sort_ties_and_legacy_defaults(api):
    http, db = api
    setup_day(http, "EMP0002")
    setup_day(http, "EMP0001")
    assert http.post("/attendance/punch-in", json={"emp_code": "EMP0001", "punched_at": stamp("2026-07-07T09:30:00")}).status_code == 201
    db.attendance_logs.update_many({}, {"$unset": {"history": "", "half_day": ""}})
    response = http.get("/attendance", params={"page_size": 2}).json()
    assert [(x["date"], x["emp_code"]) for x in response["items"]] == [("2026-07-07", "EMP0001"), ("2026-07-06", "EMP0001")]
    assert response["total"] == 3 and response["items"][0]["history"] == []
    assert response["items"][0]["half_day"] is False
    assert http.get("/attendance", params={"emp_code": "EMP0002", "date_to": "2026-07-06", "status": "PRESENT"}).json()["total"] == 1


def test_health_reports_database_failure(api, monkeypatch):
    http, _ = api
    assert http.get("/health").status_code == 200

    def unavailable(*args, **kwargs):
        raise ServerSelectionTimeoutError("test outage")

    monkeypatch.setattr(main.app.state, "mongo", SimpleNamespace(admin=SimpleNamespace(command=unavailable), close=lambda: None))
    assert http.get("/health").status_code == 503
