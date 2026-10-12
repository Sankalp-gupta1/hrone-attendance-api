import React, { useEffect, useRef } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Inbox,
  LoaderCircle,
  X,
} from "lucide-react";
import {
  avatarColor,
  csvText,
  initial,
  labels,
  number,
  prettyDate,
} from "./lib/format.js";

export function Button({
  children,
  variant = "secondary",
  icon: Icon,
  className = "",
  busy = false,
  disabled,
  ...props
}) {
  return (
    <button
      className={`button button-${variant} ${className}`}
      disabled={disabled || busy}
      {...props}
    >
      {busy ? (
        <LoaderCircle size={16} className="spin" />
      ) : Icon ? (
        <Icon size={16} />
      ) : null}
      {children}
    </button>
  );
}

export function Avatar({ name, code, small = false }) {
  return (
    <span
      aria-hidden="true"
      className={`avatar avatar-${avatarColor(code)} ${small ? "avatar-small" : ""}`}
    >
      {initial(name)}
    </span>
  );
}

export function Person({ employee, code }) {
  return (
    <div className="person">
      <Avatar name={employee?.name || code} code={code} />
      <div>
        <strong>{employee?.name || code}</strong>
        <span>
          {code}
          {employee?.department ? ` · ${employee.department}` : ""}
        </span>
      </div>
    </div>
  );
}

export function Status({ value }) {
  return (
    <span className={`status status-${value.toLowerCase()}`}>
      <i />
      {labels[value] || value}
    </span>
  );
}

export function Panel({
  children,
  title,
  description,
  action,
  className = "",
}) {
  return (
    <section className={`panel ${className}`}>
      {title ? (
        <div className="panel-heading">
          <div>
            <h2>{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Empty({
  title = "Nothing here yet",
  children,
  icon: Icon = Inbox,
  action,
  compact = false,
}) {
  return (
    <div className={`empty ${compact ? "empty-compact" : ""}`}>
      <span className="empty-icon">
        <Icon size={24} strokeWidth={1.5} />
      </span>
      <h3>{title}</h3>
      {children ? <p>{children}</p> : null}
      {action}
    </div>
  );
}

export function Loading({ label = "Loading your workspace…" }) {
  return (
    <div className="loading" role="status">
      <LoaderCircle size={20} className="spin" />
      <span>{label}</span>
    </div>
  );
}

export function ErrorMessage({ error, retry }) {
  if (!error) return null;
  return (
    <div className="inline-error" role="alert">
      <CircleHelp size={18} />
      <div>
        <strong>We couldn’t load this.</strong>
        <p>{error.message || String(error)}</p>
        {retry ? (
          <button className="text-button" onClick={retry}>
            Try again <ArrowRight size={14} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function Field({ label, hint, children, className = "" }) {
  return (
    <label className={`field ${className}`}>
      <span>{label}</span>
      {children}
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

export function Modal({ title, subtitle, children, onClose, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    const before = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      if (before instanceof HTMLElement) before.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "modal-wide" : ""}`}
      aria-labelledby="dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className="modal-heading">
        <div>
          <h2 id="dialog-title">{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}

export function Toast({ message, onClose }) {
  useEffect(() => {
    const timeout = setTimeout(onClose, 6000);
    return () => clearTimeout(timeout);
  }, [onClose]);
  return (
    <div className="toast" role="status">
      <span>
        <Check size={18} />
      </span>
      {message}
      <button
        className="icon-button"
        onClick={onClose}
        aria-label="Dismiss notification"
      >
        <X size={16} />
      </button>
    </div>
  );
}

export function Pager({ page, total, pageSize = 8, onChange }) {
  const last = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="pager">
      <span>
        {total
          ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`
          : "0 records"}
      </span>
      <div>
        <button
          className="icon-button"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
        >
          <ChevronLeft size={17} />
        </button>
        <span>
          {page} / {last}
        </span>
        <button
          className="icon-button"
          aria-label="Next page"
          disabled={page >= last}
          onClick={() => onChange(page + 1)}
        >
          <ChevronRight size={17} />
        </button>
      </div>
    </div>
  );
}

export function ExportButton({
  rows,
  columns,
  name = "attendance.csv",
  label = "Export CSV",
}) {
  function download() {
    const url = URL.createObjectURL(
      new Blob(["\uFEFF" + csvText(rows, columns)], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <Button icon={ArrowDownToLine} onClick={download} disabled={!rows?.length}>
      {label}
    </Button>
  );
}

export function StatCard({
  label,
  value,
  suffix,
  description,
  icon: Icon,
  color = "purple",
}) {
  return (
    <div className={`stat-card stat-${color}`}>
      <div className="stat-top">
        <span>{label}</span>
        <span className="stat-icon">
          <Icon size={19} strokeWidth={1.7} />
        </span>
      </div>
      <div className="stat-value">
        {value}
        <small>{suffix}</small>
      </div>
      <p>{description}</p>
    </div>
  );
}

export function TrendChart({ resource, retry }) {
  if (resource.loading) return <Loading label="Putting your trend together…" />;
  if (resource.error)
    return <ErrorMessage error={resource.error} retry={retry} />;
  const items = resource.data?.items || [];
  if (!items.length)
    return (
      <Empty compact title="Your next workday starts here">
        Add an employee and record attendance to see the trend.
      </Empty>
    );
  const width = 660,
    height = 215,
    left = 37,
    top = 18,
    bottom = 28;
  const innerHeight = height - top - bottom;
  const x = (index) =>
    left + (index / Math.max(1, items.length - 1)) * (width - left - 16);
  const y = (rate) => top + (1 - Math.max(0, Math.min(1, rate))) * innerHeight;
  function segments(key) {
    const result = [];
    let current = [];
    items.forEach((item, index) => {
      if (item[key] == null) {
        if (current.length) result.push(current);
        current = [];
      } else current.push(`${x(index).toFixed(1)},${y(item[key]).toFixed(1)}`);
    });
    if (current.length) result.push(current);
    return result;
  }
  return (
    <div className="trend-wrap">
      <svg
        className="trend-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Daily attendance rate and seven-day average. Exact values are available in the table below."
      >
        {[0, 0.25, 0.5, 0.75, 1].map((rate) => (
          <g key={rate}>
            <line
              x1={left}
              x2={width - 12}
              y1={y(rate)}
              y2={y(rate)}
              stroke="#eeedf3"
              strokeDasharray="4 5"
            />
            <text
              x={left - 9}
              y={y(rate) + 4}
              textAnchor="end"
              className="chart-label"
            >
              {rate * 100}%
            </text>
          </g>
        ))}
        {segments("moving_avg_7d").map((points, i) => (
          <polyline
            key={`avg${i}`}
            points={points.join(" ")}
            fill="none"
            stroke="#bedccf"
            strokeWidth="2.5"
            strokeDasharray="5 5"
          />
        ))}
        {segments("attendance_rate").map((points, i) => (
          <polyline
            key={i}
            points={points.join(" ")}
            fill="none"
            stroke="#8464df"
            strokeWidth="2.5"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {items.map((item, index) => (
          <g key={item.date}>
            {item.attendance_rate != null ? (
              <circle
                cx={x(index)}
                cy={y(item.attendance_rate)}
                r="3.6"
                fill="#8464df"
                stroke="white"
                strokeWidth="2"
              >
                <title>
                  {prettyDate(item.date)}:{" "}
                  {number(item.attendance_rate * 100, 1)}% attendance,{" "}
                  {item.late_count} late
                </title>
              </circle>
            ) : null}
            {index % Math.max(1, Math.floor(items.length / 6)) === 0 ? (
              <text
                x={x(index)}
                y={height - 7}
                textAnchor="middle"
                className="chart-label"
              >
                {prettyDate(item.date)}
              </text>
            ) : null}
          </g>
        ))}
      </svg>
      <div className="chart-caption">
        <span>
          <i className="legend-dot purple" /> Daily attendance
        </span>
        <span>
          <i className="legend-dot mint" /> 7-day average
        </span>
        <small>Weekends are excluded from the daily rate.</small>
      </div>
      <details className="chart-data">
        <summary>View exact numbers</summary>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Attendance</th>
                <th>7-day average</th>
                <th>Late arrivals</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.date}>
                  <td>{prettyDate(item.date)}</td>
                  <td>
                    {item.attendance_rate == null
                      ? "Non-working day"
                      : `${number(item.attendance_rate * 100, 1)}%`}
                  </td>
                  <td>
                    {item.moving_avg_7d == null
                      ? "—"
                      : `${number(item.moving_avg_7d * 100, 1)}%`}
                  </td>
                  <td>{item.late_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
