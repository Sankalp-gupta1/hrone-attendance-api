from datetime import datetime

import pytest
from pydantic import ValidationError

from app.main import (IST, EmployeeIn, PunchInIn, RegularizeIn, attendance_date,
                      derived_values, instant, valid_date, valid_month)


DAY = {"shift_start": "09:30", "shift_end": "18:30"}
NIGHT = {"shift_start": "22:00", "shift_end": "06:00"}


def stamp(value):
    return int(datetime.fromisoformat(value).replace(tzinfo=IST).timestamp() * 1000)


@pytest.mark.parametrize("clock,expected", [("09:28:00", 0), ("09:40:00", 0), ("09:40:00.999", 0),
    ("09:40:01", 10), ("10:15:59", 45)])
def test_grace_uses_seconds_before_flooring(clock, expected):
    values = derived_values("2026-07-06", DAY, "PRESENT", instant(stamp("2026-07-06T" + clock)), None)
    assert values["late_minutes"] == expected


@pytest.mark.parametrize("end,expected", [("18:59:59", 0), ("19:00:00", 30), ("19:10:59", 40)])
def test_overtime_has_a_thirty_minute_minimum(end, expected):
    values = derived_values("2026-07-06", DAY, "PRESENT", instant(stamp("2026-07-06T09:30:00")),
                            instant(stamp("2026-07-06T" + end)))
    assert values["overtime_minutes"] == expected


@pytest.mark.parametrize("seconds,hours,half_day", [(18, 0.01, True), (16092, 4.47, True),
    (16181, 4.49, True), (16182, 4.50, False), (16200, 4.50, False), (86400, 24.0, False)])
def test_half_up_and_rounded_half_day_boundary(seconds, hours, half_day):
    start = stamp("2026-07-06T09:30:00")
    values = derived_values("2026-07-06", DAY, "WFH", instant(start), instant(start + seconds * 1000))
    assert values["work_hours"] == hours
    assert values["half_day"] is half_day


@pytest.mark.parametrize("clock,day", [("2026-07-07T05:59:59", "2026-07-06"),
    ("2026-07-07T06:00:00", "2026-07-07"), ("2026-07-06T21:55:00", "2026-07-06")])
def test_overnight_date_boundary(clock, day):
    assert attendance_date(instant(stamp(clock)), NIGHT) == day


def test_ist_midnight_is_not_utc_midnight():
    assert attendance_date(instant(stamp("2026-07-07T00:00:00")), DAY) == "2026-07-07"


@pytest.mark.parametrize("value", [1783312500, "1783312500000", 1783312500000.0, True, None, 4102444800001, -1])
def test_timestamp_type_and_unit_are_strict(value):
    with pytest.raises(ValidationError):
        PunchInIn(emp_code="EMP0001", punched_at=value)


@pytest.mark.parametrize("value", ["2026-2-01", "2026-02-30", "0000-01-01", "2026-07-01T00:00:00", "20260701"])
def test_real_calendar_dates(value):
    with pytest.raises(ValueError):
        valid_date(value)


@pytest.mark.parametrize("value", ["2026-1", "2026-13", "0000-01", "2026-01-01"])
def test_real_calendar_months(value):
    with pytest.raises(ValueError):
        valid_month(value)


def test_equal_shift_times_are_invalid():
    with pytest.raises(ValidationError):
        EmployeeIn(emp_code="EMP0001", name="A", email="a@example.com", department="Ops",
                   joined_on="2026-01-01", shift_start="09:30", shift_end="09:30")


def test_nullable_and_omitted_are_not_the_same():
    assert RegularizeIn(reason="Fix clock", regularized_by="HR").model_fields_set == {"reason", "regularized_by"}
    with pytest.raises(ValidationError):
        RegularizeIn(reason="Fix clock", regularized_by="HR", punch_out=None)
