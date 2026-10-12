export const presence = ["PRESENT", "WFH", "ON_DUTY"];
export const labels = {
  PRESENT: "In office",
  WFH: "Remote",
  ON_DUTY: "On duty",
  ABSENT: "Absent",
  LEAVE: "On leave",
};

export function todayIST(now = new Date()) {
  return new Date(now.getTime() + 330 * 60000).toISOString().slice(0, 10);
}

export function shiftDate(day, days) {
  const value = new Date(`${day}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function toISTInput(milliseconds) {
  if (milliseconds == null) return "";
  return new Date(milliseconds + 330 * 60000).toISOString().slice(0, 16);
}

export function fromISTInput(value) {
  if (!value) return undefined;
  const result = Date.parse(`${value}:00+05:30`);
  if (!Number.isFinite(result))
    throw new Error("Please enter a valid date and time.");
  return result;
}

export function clock(milliseconds) {
  if (milliseconds == null) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(milliseconds));
}

export function prettyDate(day, options = {}) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    ...options,
  }).format(new Date(`${day}T12:00:00Z`));
}

export function initial(name = "") {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((s) => s[0] || "")
      .join("")
      .toUpperCase() || "?"
  );
}
export function avatarColor(code = "") {
  return [...code].reduce((n, c) => n + c.charCodeAt(0), 0) % 5;
}

// Never turn missing data into a zero: an unknown result and a measured zero differ.
export function number(value, digits = 0) {
  return value == null
    ? "—"
    : new Intl.NumberFormat("en-IN", { maximumFractionDigits: digits }).format(
        value,
      );
}

export function csvText(rows, columns) {
  const cell = (value) => {
    let text = String(value ?? "");
    if (/^(?:[=+@\-\t\r\n]|\s+[=+@\-])/.test(text)) text = `'${text}`; // Prevent spreadsheet formula injection.
    return `"${text.replaceAll('"', '""')}"`;
  };
  return [
    columns.map((c) => cell(c.label)).join(","),
    ...rows.map((row) => columns.map((c) => cell(row[c.key])).join(",")),
  ].join("\r\n");
}

export function correctionBody(record, form) {
  const body = {
    reason: form.reason.trim(),
    regularized_by: form.regularized_by.trim(),
  };
  if (form.status !== record.status) body.status = form.status;
  if (presence.includes(form.status)) {
    for (const key of ["punch_in", "punch_out"]) {
      if (form[key] !== toISTInput(record[key])) {
        if (!form[key])
          throw new Error(
            "A saved punch time cannot be cleared. Choose Absent or On leave to remove both times.",
          );
        body[key] = fromISTInput(form[key]);
      }
    }
  }
  if (Object.keys(body).length === 2)
    throw new Error("Change a status or time before saving.");
  return body;
}
