import React, { useState } from "react";
import { Check, Clock3, History, LogIn, LogOut, Plus } from "lucide-react";
import { api } from "./lib/api.js";
import {
  clock,
  correctionBody,
  fromISTInput,
  labels,
  presence,
  prettyDate,
  todayIST,
  toISTInput,
} from "./lib/format.js";
import {
  Button,
  Empty,
  ErrorMessage,
  Field,
  Modal,
  Person,
  Status,
} from "./components.jsx";

export function EmployeeForm({ employees, onClose, onSaved }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(null);
  const codes = employees
    .map((e) => Number(e.emp_code.slice(3)))
    .filter(Number.isFinite);
  const next = Math.min(999999, Math.max(1000, ...codes) + 1);
  const departments = [...new Set(employees.map((e) => e.department))].sort();
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const data = Object.fromEntries(new FormData(event.currentTarget));
    for (const key of ["emp_code", "name", "email", "department"])
      data[key] = data[key].trim();
    try {
      await api("/employees", { method: "POST", body: JSON.stringify(data) });
      onSaved(`${data.name} was added to your team.`);
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="A new face on your team"
      subtitle="Add their details once. Attendance and reports take it from here."
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="form-grid">
          <Field label="Full name">
            <input
              name="name"
              placeholder="e.g. Alex Morgan"
              autoComplete="off"
              required
              maxLength={100}
              autoFocus
            />
          </Field>
          <Field label="Employee code" hint="EMP followed by 4–6 digits.">
            <input
              name="emp_code"
              defaultValue={`EMP${String(next).padStart(4, "0")}`}
              pattern="EMP[0-9]{4,6}"
              required
              maxLength={9}
            />
          </Field>
          <Field label="Work email">
            <input
              name="email"
              type="email"
              placeholder="alex@example.com"
              required
              maxLength={120}
            />
          </Field>
          <Field label="Department">
            <input
              name="department"
              placeholder="e.g. Engineering"
              list="department-options"
              required
              maxLength={50}
            />
            <datalist id="department-options">
              {departments.map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>
          </Field>
          <Field label="Start date">
            <input
              name="joined_on"
              type="date"
              defaultValue={todayIST()}
              required
            />
          </Field>
          <div />
          <Field label="Shift starts · IST">
            <input
              name="shift_start"
              type="time"
              defaultValue="09:30"
              required
            />
          </Field>
          <Field
            label="Shift ends · IST"
            hint="An earlier end time means an overnight shift."
          >
            <input name="shift_end" type="time" defaultValue="18:30" required />
          </Field>
        </div>
        <ErrorMessage error={error} />
        <div className="modal-actions">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" icon={Plus} busy={busy}>
            Add employee
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function PunchForm({
  employees,
  type,
  code,
  selectedDate,
  onClose,
  onSaved,
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(null);
  const [timeMode, setTimeMode] = useState(
    selectedDate === todayIST() ? "now" : "custom",
  );
  const isIn = type === "in";
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const body = { emp_code: values.emp_code };
    if (isIn) body.status = values.status;
    try {
      if (timeMode === "custom")
        body.punched_at = fromISTInput(values.punched_at);
      const result = await api(`/attendance/punch-${type}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      onSaved(
        `Punch-${type} saved for ${result.emp_code} on ${prettyDate(result.date)}.`,
      );
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={isIn ? "Let’s start the workday" : "Wrap up the workday"}
      subtitle={
        isIn
          ? "Record where and when an employee starts work."
          : "Close the employee’s latest eligible open attendance record."
      }
      onClose={onClose}
    >
      {!employees.length ? (
        <Empty title="Add your first employee">
          You need an employee record before you can save a punch.
        </Empty>
      ) : (
        <form onSubmit={submit}>
          <div className="form-stack">
            <Field label="Employee">
              <select
                name="emp_code"
                defaultValue={code || ""}
                required
                autoFocus
              >
                <option value="" disabled>
                  Choose an employee
                </option>
                {employees.map((e) => (
                  <option key={e.emp_code} value={e.emp_code}>
                    {e.name} · {e.emp_code}
                  </option>
                ))}
              </select>
            </Field>
            {isIn ? (
              <Field label="Working from">
                <select name="status">
                  {presence.map((value) => (
                    <option key={value} value={value}>
                      {labels[value]}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
            <Field label="When">
              <select
                value={timeMode}
                onChange={(e) => setTimeMode(e.target.value)}
              >
                <option value="now">Use the current time</option>
                <option value="custom">Choose a date and time</option>
              </select>
            </Field>
            {timeMode === "custom" ? (
              <Field label="Date and time · IST">
                <input
                  name="punched_at"
                  type="datetime-local"
                  defaultValue={`${selectedDate}T${isIn ? "09:30" : "18:30"}`}
                  required
                />
              </Field>
            ) : (
              <div className="form-note">
                <Clock3 size={17} />
                The server saves the current time when you submit.
              </div>
            )}
          </div>
          <ErrorMessage error={error} />
          <div className="modal-actions">
            <Button type="button" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              icon={isIn ? LogIn : LogOut}
              busy={busy}
            >
              {isIn ? "Save punch-in" : "Save punch-out"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

export function CorrectionForm({ record, employee, onClose, onSaved }) {
  const [form, setForm] = useState({
    status: record.status,
    punch_in: toISTInput(record.punch_in),
    punch_out: toISTInput(record.punch_out),
    reason: "",
    regularized_by: "",
  });
  const [error, setError] = useState(null),
    [busy, setBusy] = useState(false);
  const change = (event) =>
    setForm({ ...form, [event.target.name]: event.target.value });
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = correctionBody(record, form);
      await api(
        `/attendance/${encodeURIComponent(record.emp_code)}/${record.date}`,
        { method: "PATCH", body: JSON.stringify(body) },
      );
      onSaved(
        "Correction saved. The reason and previous values are in the history.",
      );
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Make a correction"
      subtitle={`Attendance for ${prettyDate(record.date, { year: "numeric" })}. Every change is recorded.`}
      onClose={onClose}
    >
      <div className="form-person">
        <Person employee={employee} code={record.emp_code} />
        <Status value={record.status} />
      </div>
      <form onSubmit={submit}>
        <div className="form-grid">
          <Field label="Attendance status" className="field-wide">
            <select name="status" value={form.status} onChange={change}>
              {Object.entries(labels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          {presence.includes(form.status) ? (
            <>
              <Field label="Punch-in · IST">
                <input
                  name="punch_in"
                  type="datetime-local"
                  value={form.punch_in}
                  onChange={change}
                  required
                />
              </Field>
              <Field
                label="Punch-out · IST"
                hint="Leave blank if the workday is still open."
              >
                <input
                  name="punch_out"
                  type="datetime-local"
                  value={form.punch_out}
                  onChange={change}
                />
              </Field>
            </>
          ) : (
            <p className="form-note field-wide">
              Saving this status removes punch times and resets calculated work
              metrics.
            </p>
          )}
          <Field
            label="Your name"
            className="field-wide"
            hint="Saved as the correction author; this label is not a verified login."
          >
            <input
              name="regularized_by"
              value={form.regularized_by}
              onChange={change}
              placeholder="Who is making this correction?"
              minLength={1}
              maxLength={50}
              required
            />
          </Field>
          <Field label="What changed, and why?" className="field-wide">
            <textarea
              name="reason"
              value={form.reason}
              onChange={change}
              placeholder="e.g. Corrected the punch-out time after checking the shift record."
              minLength={5}
              maxLength={200}
              required
              rows={3}
            />
          </Field>
        </div>
        <ErrorMessage error={error} />
        <div className="modal-actions">
          <Button type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" icon={Check} busy={busy}>
            Save correction
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function historyValue(key, value) {
  if (value == null) return "Not recorded";
  if (key === "punch_in" || key === "punch_out")
    return `${prettyDate(toISTInput(value).slice(0, 10))}, ${clock(value)}`;
  if (key === "status") return labels[value] || value;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

export function HistoryDialog({ record, employee, onClose }) {
  return (
    <Modal
      title="The full picture"
      subtitle={`Correction history · ${prettyDate(record.date, { year: "numeric" })}`}
      onClose={onClose}
      wide
    >
      <div className="form-person">
        <Person employee={employee} code={record.emp_code} />
        <Status value={record.status} />
      </div>
      {!record.history?.length ? (
        <Empty icon={History} title="No corrections made">
          This record has not been manually changed.
        </Empty>
      ) : (
        <ol className="history-list">
          {[...record.history].reverse().map((entry, i) => (
            <li key={`${entry.at}-${i}`}>
              <span className="history-dot">
                <Check size={13} />
              </span>
              <div className="history-entry">
                <div className="history-title">
                  <strong>{entry.by}</strong>
                  <time>
                    {prettyDate(toISTInput(entry.at).slice(0, 10))} ·{" "}
                    {clock(entry.at)} IST
                  </time>
                </div>
                <p>{entry.reason}</p>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Field</th>
                        <th>Before</th>
                        <th>After</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(entry.changes).map(([key, change]) => (
                        <tr key={key}>
                          <td>{key.replaceAll("_", " ")}</td>
                          <td>{historyValue(key, change.from)}</td>
                          <td>{historyValue(key, change.to)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
      <div className="modal-actions">
        <Button onClick={onClose}>Done</Button>
      </div>
    </Modal>
  );
}
