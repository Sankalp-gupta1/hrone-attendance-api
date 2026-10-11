"""Attendance API: validation, business rules, database queries and HTTP routes.

Run from the repository root: uvicorn app.main:app --port 8000
Configuration: MONGO_URI and MONGO_DB. All application code lives in this file.
Read docs/CODE_GUIDE.md for a plain-English tour of the sections below.
"""

import calendar
import json
import logging
import os
import re
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Annotated, Any, Literal

from bson import Decimal128, json_util
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import JSONResponse
from pydantic import AfterValidator, BaseModel, ConfigDict, Field, field_validator, model_validator
from pymongo import ASCENDING, DESCENDING, IndexModel, MongoClient, ReturnDocument
from pymongo.errors import DuplicateKeyError, PyMongoError


# 1. Configuration and database lifecycle -------------------------------------
load_dotenv(override=False)  # Injected environment variables always win.
UTC = timezone.utc
IST = timezone(timedelta(hours=5, minutes=30))
EPOCH = datetime(1970, 1, 1, tzinfo=UTC)
PRESENT = ("PRESENT", "WFH", "ON_DUTY")
Status = Literal["PRESENT", "ABSENT", "LEAVE", "WFH", "ON_DUTY"]
PresenceStatus = Literal["PRESENT", "WFH", "ON_DUTY"]
logger = logging.getLogger("attendance")


def create_indexes(database):
    """Unique indexes enforce identity; the others support filters and joins."""
    database.employees.create_indexes([
        IndexModel([("emp_code", ASCENDING)], unique=True, name="employee_code_unique"),
        IndexModel([("department", ASCENDING), ("emp_code", ASCENDING)], name="employee_department_code"),
        IndexModel([("joined_on", ASCENDING), ("department", ASCENDING)], name="employee_joined_department"),
        IndexModel([("department", ASCENDING), ("joined_on", ASCENDING)], name="employee_department_joined"),
    ])
    database.attendance_logs.create_indexes([
        IndexModel([("emp_code", ASCENDING), ("date", DESCENDING)], unique=True, name="attendance_employee_date_unique"),
        IndexModel([("date", DESCENDING), ("emp_code", ASCENDING)], name="attendance_date_employee"),
        IndexModel([("status", ASCENDING), ("date", DESCENDING), ("emp_code", ASCENDING)], name="attendance_status_date_employee"),
        IndexModel([("emp_code", ASCENDING), ("punch_in", DESCENDING)], name="attendance_employee_punch"),
    ])


@asynccontextmanager
async def lifespan(application: FastAPI):
    application.state.mongo = None
    application.state.db = None
    application.state.indexes_ready = False
    uri, database_name = os.getenv("MONGO_URI"), os.getenv("MONGO_DB")
    if uri and database_name:
        try:
            client = MongoClient(uri, tz_aware=True, serverSelectionTimeoutMS=2500,
                                 connectTimeoutMS=2500, socketTimeoutMS=15000,
                                 maxPoolSize=50)
            application.state.mongo = client
            application.state.db = client[database_name]
            client.admin.command("ping")
            create_indexes(application.state.db)
            application.state.indexes_ready = True
        except (PyMongoError, ValueError):
            # Never log the URI or a driver exception containing credentials.
            logger.warning("MongoDB is not ready; /health will return 503.")
    try:
        yield
    finally:
        if application.state.mongo is not None:
            application.state.mongo.close()


app = FastAPI(title="Employee Attendance & Analytics API", version="2.0.0", lifespan=lifespan,
              description="Record attendance, correct mistakes with history, and read MongoDB-backed reports.")


def database():
    value = getattr(app.state, "db", None)
    if value is None or not getattr(app.state, "indexes_ready", False):
        raise HTTPException(503, "Database is not ready")
    return value


@app.exception_handler(PyMongoError)
async def database_error(_request: Request, _error: PyMongoError):
    return JSONResponse(status_code=503, content={"detail": "Database operation unavailable"})


# 2. Input validation ---------------------------------------------------------
def valid_date(value: str) -> str:
    if not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", value):
        raise ValueError("Use a date in YYYY-MM-DD format")
    date.fromisoformat(value)  # Also rejects impossible dates and year zero.
    return value


def valid_month(value: str) -> str:
    if not re.fullmatch(r"[0-9]{4}-(0[1-9]|1[0-2])", value):
        raise ValueError("Use a month in YYYY-MM format")
    date.fromisoformat(value + "-01")
    return value


DateText = Annotated[str, AfterValidator(valid_date)]
MonthText = Annotated[str, AfterValidator(valid_month)]
EpochMillis = Annotated[int, Field(strict=True, ge=100000000000, le=4102444800000)]
ShiftTime = Annotated[str, Field(pattern=r"^([01][0-9]|2[0-3]):[0-5][0-9]$")]
Page = Annotated[int, Query(ge=1)]
PageSize = Annotated[int, Query(ge=1, le=100)]
RankLimit = Annotated[int, Query(ge=1, le=50)]


class InputModel(BaseModel):
    model_config = ConfigDict(extra="ignore")  # Client-supplied derived values have no effect.


class EmployeeIn(InputModel):
    emp_code: Annotated[str, Field(pattern=r"^EMP[0-9]{4,6}$")]
    name: Annotated[str, Field(min_length=1, max_length=100)]
    email: Annotated[str, Field(max_length=120, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")]
    department: Annotated[str, Field(min_length=1, max_length=50)]
    shift_start: ShiftTime = "09:30"
    shift_end: ShiftTime = "18:30"
    joined_on: DateText

    @model_validator(mode="after")
    def different_shift_times(self):
        if self.shift_start == self.shift_end:
            raise ValueError("shift_start and shift_end must differ")
        return self


class PunchOutIn(InputModel):
    emp_code: str
    punched_at: EpochMillis | None = None

    @field_validator("punched_at", mode="before")
    @classmethod
    def omitted_is_allowed_but_null_is_not(cls, value):
        if value is None:
            raise ValueError("Omit punched_at for the current time; null is not an instant")
        return value


class PunchInIn(PunchOutIn):
    status: PresenceStatus = "PRESENT"


class RegularizeIn(InputModel):
    status: Status | None = None
    punch_in: EpochMillis | None = None
    punch_out: EpochMillis | None = None
    reason: Annotated[str, Field(min_length=5, max_length=200)]
    regularized_by: Annotated[str, Field(min_length=1, max_length=50)]

    @field_validator("status", "punch_in", "punch_out", mode="before")
    @classmethod
    def supplied_fields_cannot_be_null(cls, value):
        if value is None:
            raise ValueError("Omit an unchanged field instead of supplying null")
        return value


# 3. Time rules and safe response conversion ----------------------------------
def now_utc() -> datetime:
    return datetime.now(UTC).replace(microsecond=0)


def instant(milliseconds: int | None) -> datetime:
    return now_utc() if milliseconds is None else EPOCH + timedelta(seconds=milliseconds // 1000)


def utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def attendance_date(punch: datetime, employee: dict) -> str:
    local = utc(punch).replace(microsecond=0).astimezone(IST)
    day = local.date()
    if employee["shift_end"] <= employee["shift_start"] and local.strftime("%H:%M") < employee["shift_end"]:
        day -= timedelta(days=1)
    return day.isoformat()


def shift_bounds(day: str, employee: dict) -> tuple[datetime, datetime]:
    start = datetime.fromisoformat(day + "T" + employee["shift_start"]).replace(tzinfo=IST)
    end = datetime.fromisoformat(day + "T" + employee["shift_end"]).replace(tzinfo=IST)
    if employee["shift_end"] <= employee["shift_start"]:
        end += timedelta(days=1)
    return start, end


def derived_values(day: str, employee: dict, status: str, punch_in: datetime | None,
                   punch_out: datetime | None) -> dict:
    """R2-R5 use whole seconds, exact decimal rounding and the shift's own date."""
    empty = {"work_hours": None, "late_minutes": 0, "overtime_minutes": 0, "half_day": False}
    if status not in PRESENT:
        return empty
    if punch_in is None:
        raise HTTPException(422, "A presence status requires punch_in")
    start, end = shift_bounds(day, employee)
    pin = utc(punch_in).replace(microsecond=0)
    delay_seconds = int((pin - start).total_seconds())
    empty["late_minutes"] = delay_seconds // 60 if delay_seconds > 600 else 0
    if punch_out is not None:
        pout = utc(punch_out).replace(microsecond=0)
        seconds = int((pout - pin).total_seconds())
        if seconds <= 0 or seconds > 86400:
            raise HTTPException(422, "punch_out must be after punch_in and within 24 hours")
        hours = (Decimal(seconds) / Decimal(3600)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        overtime = int((pout - end).total_seconds()) // 60
        empty.update(work_hours=float(hours), overtime_minutes=overtime if overtime >= 30 else 0,
                     half_day=hours < Decimal("4.50"))
    return empty


def api_value(value: Any) -> Any:
    """Convert nested history datetimes too; MongoDB identifiers never leave here."""
    if isinstance(value, datetime):
        return int((utc(value).replace(microsecond=0) - EPOCH).total_seconds()) * 1000
    if isinstance(value, Decimal128):
        return float(value.to_decimal())
    if isinstance(value, dict):
        return {key: api_value(item) for key, item in value.items() if key != "_id"}
    if isinstance(value, list):
        return [api_value(item) for item in value]
    return value


EDITABLE = ("status", "punch_in", "punch_out", "work_hours", "late_minutes", "overtime_minutes", "half_day")
DEFAULTS = {"punch_in": None, "punch_out": None, "work_hours": None, "late_minutes": 0,
            "overtime_minutes": 0, "half_day": False, "history": []}


def record_response(document: dict) -> dict:
    return api_value({key: document.get(key, DEFAULTS.get(key))
                      for key in ("emp_code", "date", *EDITABLE, "history")})


def employee_or_404(code: str) -> dict:
    employee = database().employees.find_one({"emp_code": code})
    if employee is None:
        raise HTTPException(404, "Employee not found")
    return employee


def unchanged_filter(document: dict) -> dict:
    """Compare-and-set protects both the values and the append-only history.

    History length detects even a change that was later changed back. Including
    punch fields also detects a concurrent punch-out, which does not add history.
    """
    query = {"emp_code": document["emp_code"], "date": document["date"]}
    for key in EDITABLE:
        query[key] = document[key] if key in document else {"$exists": False}
    query["$expr"] = {"$eq": [{"$size": {"$ifNull": ["$history", []]}}, len(document.get("history", []))]}
    return query


# 4. Reusable MongoDB query and aggregation builders --------------------------
def month_bounds(month: str) -> tuple[str, str]:
    year, number = map(int, month.split("-"))
    return month + "-01", f"{month}-{calendar.monthrange(year, number)[1]:02d}"


def check_range(start: str | None, end: str | None):
    if start is not None and end is not None and start > end:
        raise HTTPException(422, "The start date must be on or before the end date")


def attendance_query(emp_code=None, date_from=None, date_to=None, status=None) -> tuple[dict, str]:
    check_range(date_from, date_to)
    query = {}
    if emp_code is not None:
        query["emp_code"] = emp_code
    if date_from is not None or date_to is not None:
        query["date"] = {}
        if date_from is not None:
            query["date"]["$gte"] = date_from
        if date_to is not None:
            query["date"]["$lte"] = date_to
    if status is not None:
        query["status"] = status
    hint = "attendance_employee_date_unique" if emp_code is not None else (
        "attendance_status_date_employee" if status is not None else "attendance_date_employee")
    return query, hint


def mongo_day(expression):
    return {"$dateFromString": {"dateString": expression, "format": "%Y-%m-%d", "timezone": "+05:30"}}


def weekday(expression):
    return {"$lte": [{"$isoDayOfWeek": {"date": mongo_day(expression), "timezone": "+05:30"}}, 5]}


def presence_weight():
    return {"$cond": [{"$in": ["$status", list(PRESENT)]},
                      {"$cond": [{"$ifNull": ["$half_day", False]}, 0.5, 1]}, 0]}


def rounded(expression, places=2):
    """All report measures are nonnegative. Decimal arithmetic gives half-up.

    MongoDB $round uses ties-to-even, so it cannot implement this contract.
    """
    scale = 10 ** places
    return {"$cond": [{"$eq": [expression, None]}, None,
        {"$toDouble": {"$divide": [{"$floor": {"$add": [
            {"$multiply": [{"$toDecimal": expression}, scale]}, Decimal128("0.5")]}}, scale]}}]}


def stats_group() -> dict:
    completed_presence = {"$and": [{"$in": ["$status", list(PRESENT)]},
                                    {"$ne": [{"$ifNull": ["$work_hours", None]}, None]}]}
    return {"$group": {
        "_id": None,
        "present_days": {"$sum": {"$cond": [weekday("$date"), presence_weight(), 0]}},
        "leave_count": {"$sum": {"$cond": [{"$eq": ["$status", "LEAVE"]}, 1, 0]}},
        "on_duty_count": {"$sum": {"$cond": [{"$eq": ["$status", "ON_DUTY"]}, 1, 0]}},
        "late_count": {"$sum": {"$cond": [{"$gt": [{"$ifNull": ["$late_minutes", 0]}, 0]}, 1, 0]}},
        "total_late_minutes": {"$sum": {"$ifNull": ["$late_minutes", 0]}},
        "total_overtime_minutes": {"$sum": {"$ifNull": ["$overtime_minutes", 0]}},
        "hours_sum": {"$sum": {"$cond": [completed_presence, {"$toDecimal": "$work_hours"}, 0]}},
        "hours_count": {"$sum": {"$cond": [completed_presence, 1, 0]}},
    }}


def working_days_expression(first: str, last: str, joined: str):
    start = max(first, joined)
    if start > last:
        return {"$literal": 0}
    days = (date.fromisoformat(last) - date.fromisoformat(start)).days + 1
    return {"$size": {"$filter": {"input": {"$range": [0, days]}, "as": "offset", "cond": {
        "$lte": [{"$isoDayOfWeek": {"date": {"$dateAdd": {"startDate": mongo_day(start),
            "unit": "day", "amount": "$$offset"}}, "timezone": "+05:30"}}, 5]}}}}


def monthly_pipeline(employee: dict, month: str) -> list:
    first, last = month_bounds(month)
    fields = ("present_days", "late_count", "total_late_minutes", "total_overtime_minutes")
    return [
        {"$match": {"emp_code": employee["emp_code"], "date": {"$gte": first, "$lte": last}}},
        {"$facet": {"stats": [stats_group()]}},
        {"$set": {"stats": {"$ifNull": [{"$arrayElemAt": ["$stats", 0]}, {}]}}},
        {"$project": {"_id": 0, "emp_code": {"$literal": employee["emp_code"]},
            "month": {"$literal": month}, "working_days": working_days_expression(first, last, employee["joined_on"]),
            "leave_days": {"$ifNull": ["$stats.leave_count", 0]},
            **{key: {"$ifNull": ["$stats." + key, 0]} for key in fields}}},
        {"$set": {"attendance_pct": {"$cond": [{"$gt": ["$working_days", 0]},
            rounded({"$divide": [{"$multiply": [{"$toDecimal": "$present_days"}, 100]}, "$working_days"]}), None]}}},
    ]


def department_pipeline(month: str, department: str | None) -> tuple[list, str]:
    first, last = month_bounds(month)
    match = {"joined_on": {"$lte": last}}
    if department is not None:
        match["department"] = department
    hint = "employee_department_joined" if department is not None else "employee_joined_department"
    sums = ("present_days", "late_count", "total_late_minutes", "leave_count", "on_duty_count", "hours_sum", "hours_count")
    pipeline = [
        {"$match": match},
        {"$lookup": {"from": "attendance_logs", "let": {"code": "$emp_code"}, "pipeline": [
            {"$match": {"$expr": {"$eq": ["$emp_code", "$$code"]}, "date": {"$gte": first, "$lte": last}}},
            stats_group()], "as": "stats"}},
        {"$set": {"stats": {"$ifNull": [{"$arrayElemAt": ["$stats", 0]}, {}]}}},
        {"$group": {"_id": "$department", "headcount": {"$sum": 1},
            **{key: {"$sum": {"$ifNull": ["$stats." + key, 0]}} for key in sums}}},
        {"$project": {"_id": 0, "department": "$_id", "headcount": 1,
            **{key: 1 for key in sums if not key.startswith("hours_")},
            "avg_work_hours": {"$cond": [{"$gt": ["$hours_count", 0]},
                rounded({"$divide": ["$hours_sum", "$hours_count"]}), None]}}},
        {"$sort": {"department": 1}},
    ]
    return pipeline, hint


def leaderboard_pipeline(month: str, department: str | None, limit: int) -> list:
    first, last = month_bounds(month)
    pipeline = [
        {"$match": {"date": {"$gte": first, "$lte": last}}},
        {"$group": {"_id": "$emp_code", "total_late_minutes": {"$sum": {"$ifNull": ["$late_minutes", 0]}},
            "late_count": {"$sum": {"$cond": [{"$gt": [{"$ifNull": ["$late_minutes", 0]}, 0]}, 1, 0]}}}},
        {"$match": {"total_late_minutes": {"$gt": 0}}},
        {"$lookup": {"from": "employees", "localField": "_id", "foreignField": "emp_code", "as": "employee"}},
        {"$unwind": "$employee"},  # Drops orphan logs before ranking.
    ]
    if department is not None:
        pipeline.append({"$match": {"employee.department": department}})
    return pipeline + [
        {"$setWindowFields": {"sortBy": {"total_late_minutes": -1}, "output": {"rank": {"$rank": {}}}}},
        {"$match": {"rank": {"$lte": limit}}},
        {"$project": {"_id": 0, "emp_code": "$_id", "name": "$employee.name", "department": "$employee.department",
            "rank": 1, "total_late_minutes": 1, "late_count": 1}},
        {"$sort": {"total_late_minutes": -1, "emp_code": 1}},
    ]


def trend_pipeline(department: str, first: str, last: str) -> list:
    check_range(first, last)
    days = (date.fromisoformat(last) - date.fromisoformat(first)).days + 1
    if days > 92:
        raise HTTPException(422, "The inclusive range cannot exceed 92 days")
    if database().employees.find_one({"department": department}, {"_id": 1}) is None:
        raise HTTPException(404, "Department not found")
    return [
        {"$match": {"department": department}}, {"$limit": 1},
        # Build the calendar inside MongoDB, even when the range has no logs.
        {"$project": {"_id": 0, "offset": {"$range": [0, days]}}},
        {"$unwind": "$offset"},
        {"$set": {"day": {"$dateAdd": {"startDate": mongo_day(first), "unit": "day", "amount": "$offset"}}}},
        {"$project": {"date": {"$dateToString": {"date": "$day", "format": "%Y-%m-%d", "timezone": "+05:30"}},
            "is_working_day": {"$lte": [{"$isoDayOfWeek": {"date": "$day", "timezone": "+05:30"}}, 5]}}},
        {"$lookup": {"from": "employees", "let": {"day": "$date"}, "pipeline": [
            {"$match": {"department": department, "$expr": {"$lte": ["$joined_on", "$$day"]}}},
            {"$count": "value"}], "as": "people"}},
        {"$lookup": {"from": "attendance_logs", "let": {"day": "$date"}, "pipeline": [
            {"$match": {"$expr": {"$eq": ["$date", "$$day"]}}},
            {"$lookup": {"from": "employees", "localField": "emp_code", "foreignField": "emp_code", "as": "employee"}},
            {"$unwind": "$employee"}, {"$match": {"employee.department": department}},
            {"$group": {"_id": None, "present_count": {"$sum": presence_weight()},
                "late_count": {"$sum": {"$cond": [{"$gt": [{"$ifNull": ["$late_minutes", 0]}, 0]}, 1, 0]}}}}], "as": "logs"}},
        {"$set": {"headcount": {"$ifNull": [{"$arrayElemAt": ["$people.value", 0]}, 0]},
            "present_count": {"$ifNull": [{"$arrayElemAt": ["$logs.present_count", 0]}, 0]},
            "late_count": {"$ifNull": [{"$arrayElemAt": ["$logs.late_count", 0]}, 0]}}},
        {"$set": {"attendance_rate": {"$cond": [{"$and": ["$is_working_day", {"$gt": ["$headcount", 0]}]},
            rounded({"$divide": [{"$toDecimal": "$present_count"}, "$headcount"]}, 4), None]}}},
        {"$setWindowFields": {"sortBy": {"date": 1}, "output": {"moving_avg_7d": {
            "$avg": {"$toDecimal": "$attendance_rate"}, "window": {"documents": [-6, 0]}}}}},
        {"$project": {"_id": 0, "date": 1, "is_working_day": 1, "headcount": 1, "present_count": 1,
            "late_count": 1, "attendance_rate": 1, "moving_avg_7d": rounded("$moving_avg_7d", 4)}},
        {"$sort": {"date": 1}},
    ]


def aggregate(collection: str, pipeline: list, hint: str) -> list:
    return api_value(list(database()[collection].aggregate(pipeline, hint=hint, allowDiskUse=True)))


# 5. HTTP endpoints -----------------------------------------------------------
@app.get("/health", tags=["system"], operation_id="health")
def health():
    client = getattr(app.state, "mongo", None)
    if client is None:
        raise HTTPException(503, "Database is not configured")
    try:
        client.admin.command("ping")
        if not app.state.indexes_ready:
            create_indexes(app.state.db)
            app.state.indexes_ready = True
    except PyMongoError:
        raise HTTPException(503, "Database is not ready") from None
    return {"status": "ok"}


@app.post("/employees", status_code=201, tags=["employees"], operation_id="createEmployee")
def create_employee(body: EmployeeIn):
    doc = {**body.model_dump(), "created_at": now_utc()}
    try:
        database().employees.insert_one(doc)
    except DuplicateKeyError:
        raise HTTPException(409, "emp_code already exists") from None
    return api_value(doc)


@app.get("/employees", tags=["employees"], operation_id="listEmployees")
def list_employees(department: str | None = None, page: Page = 1, page_size: PageSize = 20):
    query = {} if department is None else {"department": department}
    collection = database().employees
    hint = "employee_code_unique" if department is None else "employee_department_code"
    items = list(collection.find(query, {"_id": 0}).hint(hint).sort("emp_code", 1).skip((page - 1) * page_size).limit(page_size))
    return {"items": api_value(items), "total": collection.count_documents(query, hint=hint), "page": page, "page_size": page_size}


@app.post("/attendance/punch-in", status_code=201, tags=["attendance"], operation_id="punchIn")
def punch_in(body: PunchInIn):
    employee = employee_or_404(body.emp_code)
    timestamp = instant(body.punched_at)
    day = attendance_date(timestamp, employee)
    document = {"emp_code": body.emp_code, "date": day, "status": body.status, "punch_in": timestamp,
                "punch_out": None, "history": [], **derived_values(day, employee, body.status, timestamp, None)}
    try:
        database().attendance_logs.insert_one(document)
    except DuplicateKeyError:
        raise HTTPException(409, "Attendance already exists for this employee and date") from None
    return record_response(document)


@app.post("/attendance/punch-out", tags=["attendance"], operation_id="punchOut")
def punch_out(body: PunchOutIn):
    employee = employee_or_404(body.emp_code)
    timestamp = instant(body.punched_at)
    collection = database().attendance_logs
    document = collection.find_one({"emp_code": body.emp_code, "punch_in": {"$ne": None, "$lte": timestamp}},
                                   sort=[("punch_in", -1)], hint="attendance_employee_punch")
    if document is None:
        raise HTTPException(404, "No punch-in found at or before this time")
    if document.get("punch_out") is not None:
        raise HTTPException(409, "This record is already punched out")
    values = derived_values(document["date"], employee, document["status"], document["punch_in"], timestamp)
    result = collection.find_one_and_update(unchanged_filter(document),
        {"$set": {"punch_out": timestamp, **values}}, return_document=ReturnDocument.AFTER)
    if result is None:
        raise HTTPException(409, "The record changed while this request was running; read it again")
    return record_response(result)


@app.get("/attendance", tags=["attendance"], operation_id="listAttendance")
def list_attendance(emp_code: str | None = None, date_from: DateText | None = None, date_to: DateText | None = None,
                    status: Status | None = None, page: Page = 1, page_size: PageSize = 20):
    query, hint = attendance_query(emp_code, date_from, date_to, status)
    collection = database().attendance_logs
    cursor = collection.find(query, {"_id": 0}).hint(hint).sort([("date", -1), ("emp_code", 1)]).skip((page - 1) * page_size).limit(page_size)
    return {"items": [record_response(row) for row in cursor], "total": collection.count_documents(query, hint=hint),
            "page": page, "page_size": page_size}


@app.patch("/attendance/{emp_code}/{date}", tags=["attendance"], operation_id="regularizeAttendance")
def regularize_attendance(emp_code: str, date: DateText, body: RegularizeIn):
    employee = employee_or_404(emp_code)
    collection = database().attendance_logs
    original = collection.find_one({"emp_code": emp_code, "date": date})
    if original is None:
        raise HTTPException(404, "Attendance record not found")
    final = {key: original.get(key, DEFAULTS.get(key)) for key in EDITABLE}
    supplied = body.model_fields_set
    if "status" in supplied:
        final["status"] = body.status
    if final["status"] not in PRESENT:
        if {"punch_in", "punch_out"} & supplied:
            raise HTTPException(422, "ABSENT and LEAVE cannot be supplied with punch times")
        final.update(punch_in=None, punch_out=None)
    else:
        for key in ("punch_in", "punch_out"):
            if key in supplied:
                final[key] = instant(getattr(body, key))
            elif final[key] is not None:
                final[key] = utc(final[key]).replace(microsecond=0)
        if final["punch_in"] is None:
            raise HTTPException(422, "A presence status requires punch_in")
        if attendance_date(final["punch_in"], employee) != date:
            raise HTTPException(422, "punch_in must stay on the record's attendance date")
    final.update(derived_values(date, employee, final["status"], final["punch_in"], final["punch_out"]))
    changes = {key: {"from": original.get(key, DEFAULTS.get(key)), "to": final[key]}
               for key in EDITABLE if original.get(key, DEFAULTS.get(key)) != final[key]}
    if not changes:
        raise HTTPException(422, "This request changes nothing")
    entry = {"at": now_utc(), "by": body.regularized_by, "reason": body.reason, "changes": changes}
    result = collection.find_one_and_update(unchanged_filter(original), {"$set": final, "$push": {"history": entry}},
                                             return_document=ReturnDocument.AFTER)
    if result is None:
        raise HTTPException(409, "The record changed while this correction was running; read it again")
    return record_response(result)


@app.get("/analytics/employees/{emp_code}/monthly", tags=["analytics"], operation_id="employeeMonthly")
def employee_monthly(emp_code: str, month: MonthText):
    employee = employee_or_404(emp_code)
    return aggregate("attendance_logs", monthly_pipeline(employee, month), "attendance_employee_date_unique")[0]


@app.get("/analytics/departments/summary", tags=["analytics"], operation_id="departmentSummary")
def department_summary(month: MonthText, department: str | None = None):
    pipeline, hint = department_pipeline(month, department)
    return {"month": month, "items": aggregate("employees", pipeline, hint)}


@app.get("/analytics/leaderboard/late", tags=["analytics"], operation_id="lateLeaderboard")
def late_leaderboard(month: MonthText, department: str | None = None, limit: RankLimit = 10):
    return {"month": month, "items": aggregate("attendance_logs", leaderboard_pipeline(month, department, limit), "attendance_date_employee")}


@app.get("/analytics/departments/{department}/trend", tags=["analytics"], operation_id="departmentTrend")
def department_trend(department: str, from_date: Annotated[DateText, Query(alias="from")],
                     to_date: Annotated[DateText, Query(alias="to")]):
    return {"department": department, "items": aggregate("employees", trend_pipeline(department, from_date, to_date), "employee_department_code")}


ExplainEndpoint = Literal["attendance_list", "employee_monthly", "department_summary", "late_leaderboard", "department_trend"]


@app.get("/admin/explain/{endpoint}", tags=["admin"], operation_id="explainEndpoint")
def explain_endpoint(endpoint: ExplainEndpoint, emp_code: str | None = None, month: MonthText | None = None,
                     department: str | None = None, limit: RankLimit = 10,
                     date_from: DateText | None = None, date_to: DateText | None = None,
                     status: Status | None = None, page: Page = 1, page_size: PageSize = 20,
                     from_date: Annotated[DateText | None, Query(alias="from")] = None,
                     to_date: Annotated[DateText | None, Query(alias="to")] = None):
    if endpoint == "attendance_list":
        query, hint = attendance_query(emp_code, date_from, date_to, status)
        collection = "attendance_logs"
        command = {"find": collection, "filter": query, "projection": {"_id": 0}, "sort": {"date": -1, "emp_code": 1},
                   "skip": (page - 1) * page_size, "limit": page_size, "hint": hint}
    else:
        if endpoint != "department_trend" and month is None:
            raise HTTPException(422, "month is required for this endpoint")
        if endpoint == "employee_monthly":
            if emp_code is None:
                raise HTTPException(422, "emp_code is required for employee_monthly")
            pipeline = monthly_pipeline(employee_or_404(emp_code), month)
            collection, hint = "attendance_logs", "attendance_employee_date_unique"
        elif endpoint == "department_summary":
            pipeline, hint = department_pipeline(month, department)
            collection = "employees"
        elif endpoint == "late_leaderboard":
            pipeline = leaderboard_pipeline(month, department, limit)
            collection, hint = "attendance_logs", "attendance_date_employee"
        else:
            if department is None or from_date is None or to_date is None:
                raise HTTPException(422, "department, from and to are required for department_trend")
            pipeline = trend_pipeline(department, from_date, to_date)
            collection, hint = "employees", "employee_department_code"
        command = {"aggregate": collection, "pipeline": pipeline, "cursor": {}, "hint": hint, "allowDiskUse": True}
    explained = database().command("explain", command, verbosity="executionStats")
    # Preserve the explain document, including any BSON values as Extended JSON.
    return {"endpoint": endpoint, "collection": collection, "explain": json.loads(json_util.dumps(explained))}
