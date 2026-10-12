import test from "node:test";
import assert from "node:assert/strict";
import {
  correctionBody,
  csvText,
  fromISTInput,
  number,
  shiftDate,
  todayIST,
  toISTInput,
} from "./format.js";

test("IST dates cross UTC midnight without depending on the device time zone", () => {
  assert.equal(todayIST(new Date("2026-10-11T19:00:00Z")), "2026-10-12");
  assert.equal(
    fromISTInput("2026-10-12T09:30"),
    Date.parse("2026-10-12T04:00:00Z"),
  );
  assert.equal(
    toISTInput(Date.parse("2026-10-11T23:00:00Z")),
    "2026-10-12T04:30",
  );
  assert.equal(shiftDate("2026-03-01", -1), "2026-02-28");
});

test("corrections preserve untouched punch seconds and omit calculated values", () => {
  const record = {
    status: "PRESENT",
    punch_in: Date.parse("2026-10-12T04:10:01Z"),
    punch_out: null,
  };
  const form = {
    status: "WFH",
    punch_in: toISTInput(record.punch_in),
    punch_out: "",
    reason: "Working remotely today",
    regularized_by: "Demo Manager",
  };
  assert.deepEqual(correctionBody(record, form), {
    status: "WFH",
    reason: form.reason,
    regularized_by: form.regularized_by,
  });
  const absent = correctionBody(record, { ...form, status: "ABSENT" });
  assert.equal(absent.status, "ABSENT");
  assert.equal("punch_in" in absent, false);
});

test("empty corrections and attempts to clear a single existing punch fail before saving", () => {
  const record = {
    status: "PRESENT",
    punch_in: Date.parse("2026-10-12T04:00:00Z"),
    punch_out: null,
  };
  const form = {
    ...record,
    punch_in: toISTInput(record.punch_in),
    punch_out: "",
    reason: "Reviewed record",
    regularized_by: "Demo Manager",
  };
  assert.throws(() => correctionBody(record, form), /Change a status/);
  assert.throws(
    () => correctionBody(record, { ...form, punch_in: "" }),
    /cannot be cleared/,
  );
});

test("CSV quotes cells and neutralizes spreadsheet formula inputs", () => {
  const result = csvText(
    [{ name: '=HYPERLINK("https://example.com")', hours: 0 }],
    [
      { key: "name", label: "Name" },
      { key: "hours", label: "Hours" },
    ],
  );
  assert.match(result, /'\=HYPERLINK/);
  assert.match(result, /""https:\/\/example.com""/);
  assert.match(result, /,"0"$/);
  assert.equal(number(null), "—");
  assert.equal(number(0), "0");
});
