import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Database,
  ExternalLink,
  Fingerprint,
  History,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  MoreHorizontal,
  PencilLine,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  WifiOff,
  X,
} from "lucide-react";
import { query, useResource } from "./lib/api.js";
import {
  clock,
  labels,
  number,
  presence,
  prettyDate,
  shiftDate,
  todayIST,
} from "./lib/format.js";
import {
  Avatar,
  Button,
  Empty,
  ErrorMessage,
  ExportButton,
  Field,
  Loading,
  Pager,
  Panel,
  Person,
  StatCard,
  Status,
  Toast,
  TrendChart,
} from "./components.jsx";
import {
  CorrectionForm,
  EmployeeForm,
  HistoryDialog,
  PunchForm,
} from "./forms.jsx";

const navItems = [
  { id: "overview", name: "Overview", icon: LayoutDashboard },
  { id: "attendance", name: "Attendance", icon: Fingerprint },
  { id: "people", name: "People", icon: Users },
  { id: "reports", name: "Reports", icon: BarChart3 },
];
const exportColumns = [
  { key: "emp_code", label: "Employee code" },
  { key: "name", label: "Name" },
  { key: "department", label: "Department" },
  { key: "date", label: "Date" },
  { key: "status", label: "Status" },
  { key: "in_time", label: "Punch in (IST)" },
  { key: "out_time", label: "Punch out (IST)" },
  { key: "work_hours", label: "Work hours" },
  { key: "late_minutes", label: "Late minutes" },
  { key: "overtime_minutes", label: "Overtime minutes" },
];
const pageCopy = {
  overview: [
    "Your team, at a glance.",
    "A little clarity for a better workday.",
  ],
  attendance: [
    "Every workday, accounted for.",
    "Record time. Fix a mistake. Keep the full story.",
  ],
  people: [
    "Good work starts with people.",
    "A simple home for everyone on your team.",
  ],
  reports: [
    "See the story behind the hours.",
    "Useful answers, straight from your attendance records.",
  ],
  guide: [
    "A little help goes a long way.",
    "Everything you need to feel at home in Attend.",
  ],
};

function initialView() {
  const hash =
    typeof window === "undefined" ? "" : window.location.hash.slice(1);
  return pageCopy[hash] ? hash : "overview";
}

export default function App() {
  const [view, setView] = useState(initialView),
    [menuOpen, setMenuOpen] = useState(false);
  const [day, setDay] = useState(todayIST),
    [revision, setRevision] = useState(0);
  const [modal, setModal] = useState(null),
    [toast, setToast] = useState("");
  const [department, setDepartment] = useState(""),
    [search, setSearch] = useState("");
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  const dismissToast = useCallback(() => setToast(""), []);
  const health = useResource("/health", revision);
  const online = health.data?.status === "ok";
  const employeeResource = useResource(
    online ? "/employees" : null,
    revision,
    true,
  );
  const attendance = useResource(
    online ? query("/attendance", { date_from: day, date_to: day }) : null,
    revision,
    true,
  );
  const employees = employeeResource.data?.items || [];
  const employeeMap = useMemo(
    () => new Map(employees.map((employee) => [employee.emp_code, employee])),
    [employeeResource.data],
  );
  const departments = useMemo(
    () => [...new Set(employees.map((employee) => employee.department))].sort(),
    [employeeResource.data],
  );
  const currentDepartment = departments.includes(department)
    ? department
    : departments[0] || "";
  const trend = useResource(
    online && currentDepartment
      ? query(
          `/analytics/departments/${encodeURIComponent(currentDepartment)}/trend`,
          { from: shiftDate(day, -13), to: day },
        )
      : null,
    revision,
  );
  const summary = useResource(
    online
      ? query("/analytics/departments/summary", { month: day.slice(0, 7) })
      : null,
    revision,
  );
  const todayRows = attendance.data?.items || [];
  const ready =
    online && Boolean(employeeResource.data) && Boolean(attendance.data);
  const activePeople = employees.filter(
    (employee) => employee.joined_on <= day,
  );
  const presentCount = todayRows.filter((row) =>
    presence.includes(row.status),
  ).length;
  const lateCount = todayRows.filter((row) => row.late_minutes > 0).length;
  const openCount = todayRows.filter(
    (row) =>
      row.punch_in != null &&
      row.punch_out == null &&
      presence.includes(row.status),
  ).length;
  const missingCount = Math.max(
    0,
    activePeople.length - new Set(todayRows.map((row) => row.emp_code)).size,
  );
  const localError = employeeResource.error || attendance.error;
  const topSearch = search.trim().toLowerCase();
  const filteredRows = todayRows.filter((row) => {
    const employee = employeeMap.get(row.emp_code);
    return `${row.emp_code} ${employee?.name || ""} ${employee?.department || ""}`
      .toLowerCase()
      .includes(topSearch);
  });
  const exportedRows = filteredRows.map((row) => ({
    ...row,
    name: employeeMap.get(row.emp_code)?.name,
    department: employeeMap.get(row.emp_code)?.department,
    in_time: clock(row.punch_in),
    out_time: clock(row.punch_out),
  }));
  function navigate(next) {
    setView(next);
    setMenuOpen(false);
    window.location.hash = next;
  }
  useEffect(() => {
    const changed = () => setView(initialView());
    window.addEventListener("hashchange", changed);
    return () => window.removeEventListener("hashchange", changed);
  }, []);
  function saved(message) {
    setModal(null);
    setToast(message);
    refresh();
  }
  const showPunch = (type = "in", code) =>
    setModal({ type: "punch", punchType: type, code });

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {menuOpen ? (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setMenuOpen(false)}
        />
      ) : null}
      <aside
        className={`sidebar ${menuOpen ? "sidebar-open" : ""}`}
        aria-label="Main navigation"
      >
        <a
          href="#overview"
          className="brand"
          onClick={() => navigate("overview")}
        >
          <span className="brand-mark">
            <span />
            <span />
            <span />
          </span>
          attend<span className="brand-period">.</span>
        </a>
        <div className="workspace-switch">
          <span className="workspace-icon">
            <Users size={17} />
          </span>
          <div>
            <strong>People workspace</strong>
            <span>Your team’s everyday space</span>
          </div>
          <ShieldCheck size={14} />
        </div>
        <div className="nav-caption">WORKSPACE</div>
        <nav>
          {navItems.map((item) => (
            <a
              href={`#${item.id}`}
              key={item.id}
              aria-current={view === item.id ? "page" : undefined}
              className={`nav-item ${view === item.id ? "active" : ""}`}
              onClick={() => navigate(item.id)}
            >
              <item.icon size={19} strokeWidth={1.8} />
              <span>{item.name}</span>
              {item.id === "people" && employeeResource.data ? (
                <span className="nav-count">{employeeResource.data.total}</span>
              ) : null}
              {view === item.id ? <span className="nav-active-dot" /> : null}
            </a>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-note">
          <span className="note-stars">
            <Sparkles size={21} />
          </span>
          <h3>
            A calmer kind
            <br />
            of people management.
          </h3>
          <p>
            Less chasing spreadsheets.
            <br />
            More time for your team.
          </p>
          <button onClick={() => navigate("guide")}>
            Take a quick tour <ArrowUpRight size={16} />
          </button>
        </div>
        <a
          href="#guide"
          className={`nav-item ${view === "guide" ? "active" : ""}`}
          onClick={() => navigate("guide")}
        >
          <CircleHelp size={19} />
          <span>Help & getting started</span>
        </a>
        <a href="/docs" className="nav-item" target="_blank" rel="noreferrer">
          <BookOpen size={18} />
          <span>API documentation</span>
          <ExternalLink size={13} />
        </a>
        <div className="sidebar-profile">
          <span className="profile-avatar">PW</span>
          <div>
            <strong>People workspace</strong>
            <span>Protected demo · IST</span>
          </div>
          <ShieldCheck size={16} />
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
            >
              <Menu size={21} />
            </button>
            <span className="breadcrumb">
              Workspace <ChevronRight size={13} />
              <strong>
                {view === "guide"
                  ? "Getting started"
                  : navItems.find((item) => item.id === view)?.name}
              </strong>
            </span>
          </div>
          <div className="topbar-right">
            <span
              className={`connection-pill ${online ? "is-online" : health.loading ? "is-checking" : "is-offline"}`}
            >
              <i />
              {health.loading
                ? "Connecting"
                : online
                  ? "Database connected"
                  : "Connection needed"}
            </span>
            <button
              className="icon-button"
              title="Refresh workspace"
              aria-label="Refresh workspace"
              onClick={refresh}
              disabled={health.loading}
            >
              <RefreshCw size={17} className={health.loading ? "spin" : ""} />
            </button>
            <div className="topbar-divider" />
            <span className="profile-avatar profile-small">PW</span>
          </div>
        </header>
        <main id="main-content" className="main-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {view === "overview"
                  ? "MAKE ROOM FOR A BETTER WORKDAY"
                  : "YOUR PEOPLE, IN FOCUS"}
              </div>
              <h1>{pageCopy[view][0]}</h1>
              <p>{pageCopy[view][1]}</p>
            </div>
            <div className="heading-actions">
              <label className="date-picker">
                <CalendarDays size={16} />
                <span className="sr-only">Workspace date</span>
                <input
                  aria-label="Workspace date"
                  type="date"
                  value={day}
                  onChange={(event) => {
                    if (event.target.value) setDay(event.target.value);
                  }}
                />
              </label>
              <Button
                variant="primary"
                icon={Plus}
                onClick={() => setModal({ type: "employee" })}
                disabled={!online}
              >
                Add employee
              </Button>
            </div>
          </div>
          {!health.loading && !online ? (
            <div className="connection-banner" role="status">
              <span className="connection-banner-icon">
                <Database size={22} />
              </span>
              <div>
                <strong>Let’s connect your workspace.</strong>
                <p>
                  {health.error?.message ||
                    "The database connection needs attention."}{" "}
                  Your dashboard is ready; saved records will appear here once
                  connected.
                </p>
              </div>
              <Button onClick={refresh} icon={RefreshCw}>
                Check again
              </Button>
            </div>
          ) : null}
          {localError ? (
            <ErrorMessage error={localError} retry={refresh} />
          ) : null}
          {view === "overview" ? (
            <>
              <section className="welcome-banner">
                <div className="welcome-copy">
                  <div className="welcome-label">
                    <span className="welcome-dot" /> A LITTLE MORE HUMAN. A LOT
                    MORE CLEAR.
                  </div>
                  <h2>
                    Good days start
                    <br />
                    with <em>great people.</em>
                  </h2>
                  <p>
                    Keep the small details in sync,
                    <br />
                    so your team can focus on the big things.
                  </p>
                  <button
                    className="welcome-link"
                    onClick={() => showPunch()}
                    disabled={!online}
                  >
                    Let’s start the day <ArrowUpRight size={18} />
                  </button>
                </div>
                <div className="welcome-art" aria-hidden="true">
                  <span className="art-ring ring-one" />
                  <span className="art-ring ring-two" />
                  <span className="art-grain" />
                  <div className="art-note">
                    <span className="art-check">
                      <Check size={16} />
                    </span>
                    <div>
                      <strong>Every moment counts.</strong>
                      <span>A little structure. A lot of possibility.</span>
                    </div>
                  </div>
                  <div className="art-clock">
                    <div className="clock-center" />
                    <i className="hand-hour" />
                    <i className="hand-minute" />
                    {[0, 1, 2, 3].map((value) => (
                      <b
                        key={value}
                        style={{ transform: `rotate(${value * 90}deg)` }}
                      />
                    ))}
                  </div>
                  <div className="art-spark">✳</div>
                  <span className="art-caption">made for your everyday.</span>
                </div>
              </section>
              <div className="section-label">
                <h2>The daily picture</h2>
                <span>
                  {prettyDate(day, { weekday: "long" })} <i /> All times in IST
                </span>
              </div>
              <div className="stats-grid">
                <StatCard
                  label="Team members"
                  value={ready ? number(activePeople.length) : "—"}
                  description="Joined on or before this date"
                  icon={Users}
                />
                <StatCard
                  label="Here today"
                  value={ready ? number(presentCount) : "—"}
                  description="In office, remote or on duty"
                  icon={CheckCheck}
                  color="green"
                />
                <StatCard
                  label="Late arrivals"
                  value={ready ? number(lateCount) : "—"}
                  description="After the 10-minute grace period"
                  icon={Clock3}
                  color="amber"
                />
                <StatCard
                  label="Still clocked in"
                  value={ready ? number(openCount) : "—"}
                  description="Workdays without a punch-out"
                  icon={Fingerprint}
                  color="blue"
                />
              </div>
              <div className="overview-grid">
                <Panel
                  title="A rhythm you can see"
                  description="Your department’s attendance over the last 14 days."
                  action={
                    <label className="compact-select">
                      <span className="sr-only">Trend department</span>
                      <select
                        value={currentDepartment}
                        onChange={(e) => setDepartment(e.target.value)}
                        disabled={!departments.length}
                      >
                        <option value="" disabled>
                          Department
                        </option>
                        {departments.map((d) => (
                          <option key={d}>{d}</option>
                        ))}
                      </select>
                    </label>
                  }
                >
                  <TrendChart resource={trend} retry={refresh} />
                </Panel>
                <QuickActions
                  online={online}
                  ready={ready}
                  missing={missingCount}
                  showPunch={showPunch}
                  onPeople={() => navigate("people")}
                  onAttendance={() => navigate("attendance")}
                />
              </div>
              <Panel
                title="Today, together"
                description="The latest attendance records for your selected date."
                action={
                  <button
                    className="text-button"
                    onClick={() => navigate("attendance")}
                  >
                    View all attendance <ArrowRight size={15} />
                  </button>
                }
              >
                <AttendanceTable
                  rows={todayRows.slice(0, 5)}
                  employeeMap={employeeMap}
                  loading={attendance.loading || health.loading}
                  emptyTitle={
                    online
                      ? "A fresh page for your team"
                      : "Your attendance will live here"
                  }
                  onCorrect={(record) =>
                    setModal({ type: "correction", record })
                  }
                  onHistory={(record) => setModal({ type: "history", record })}
                  onPunchOut={(code) => showPunch("out", code)}
                />
              </Panel>
              <div className="bottom-note">
                <ShieldCheck size={15} />
                <span>
                  Every correction keeps its history. Every number comes from
                  your records.
                </span>
                <span className="bottom-note-right">Thoughtfully simple.</span>
              </div>
            </>
          ) : null}
          {view === "attendance" ? (
            <>
              <div className="action-strip">
                <div className="soft-icon">
                  <Fingerprint size={22} />
                </div>
                <div>
                  <strong>A workday starts with one click.</strong>
                  <p>Record a punch now, or choose a past date and time.</p>
                </div>
                <Button
                  icon={LogOut}
                  onClick={() => showPunch("out")}
                  disabled={!online}
                >
                  Punch out
                </Button>
                <Button
                  variant="primary"
                  icon={LogIn}
                  onClick={() => showPunch("in")}
                  disabled={!online}
                >
                  Punch in
                </Button>
              </div>
              <AttendanceView
                day={day}
                rows={filteredRows}
                exportedRows={exportedRows}
                employeeMap={employeeMap}
                loading={attendance.loading || health.loading}
                search={search}
                setSearch={setSearch}
                onCorrect={(record) => setModal({ type: "correction", record })}
                onHistory={(record) => setModal({ type: "history", record })}
                onPunchOut={(code) => showPunch("out", code)}
              />
              <div className="info-line">
                <CircleHelp size={15} />
                No record means “not recorded”, not automatically absent. Mark a
                saved record as absent or on leave through a correction.
              </div>
            </>
          ) : null}
          {view === "people" ? (
            <PeopleView
              employees={employees}
              loaded={Boolean(employeeResource.data)}
              loading={employeeResource.loading || health.loading}
              online={online}
              search={search}
              setSearch={setSearch}
              onAdd={() => setModal({ type: "employee" })}
              onPunch={(code) => showPunch("in", code)}
            />
          ) : null}
          {view === "reports" ? (
            <ReportsView
              online={online}
              month={day.slice(0, 7)}
              employees={employees}
              departments={departments}
              summary={summary}
              revision={revision}
              refresh={refresh}
              currentDepartment={currentDepartment}
              setDepartment={setDepartment}
              trend={trend}
            />
          ) : null}
          {view === "guide" ? (
            <Guide onNavigate={navigate} online={online} />
          ) : null}
        </main>
        <footer className="footer">
          <span>
            <span className="footer-brand">attend.</span> A little clarity,
            every day.
          </span>
          <span>Fictional data only · Asia/Kolkata (IST)</span>
        </footer>
      </div>
      {modal?.type === "employee" ? (
        <EmployeeForm
          employees={employees}
          onClose={() => setModal(null)}
          onSaved={saved}
        />
      ) : null}
      {modal?.type === "punch" ? (
        <PunchForm
          employees={employees}
          type={modal.punchType}
          code={modal.code}
          selectedDate={day}
          onClose={() => setModal(null)}
          onSaved={saved}
        />
      ) : null}
      {modal?.type === "correction" ? (
        <CorrectionForm
          record={modal.record}
          employee={employeeMap.get(modal.record.emp_code)}
          onClose={() => setModal(null)}
          onSaved={saved}
        />
      ) : null}
      {modal?.type === "history" ? (
        <HistoryDialog
          record={modal.record}
          employee={employeeMap.get(modal.record.emp_code)}
          onClose={() => setModal(null)}
        />
      ) : null}
      {toast ? <Toast message={toast} onClose={dismissToast} /> : null}
    </div>
  );
}

function QuickActions({
  online,
  ready,
  missing,
  showPunch,
  onPeople,
  onAttendance,
}) {
  return (
    <Panel
      className="quick-panel"
      title="Small actions. Big clarity."
      description="Keep the day moving."
    >
      <div className="quick-actions">
        <button disabled={!online} onClick={() => showPunch("in")}>
          <span className="quick-icon purple-bg">
            <LogIn size={19} />
          </span>
          <div>
            <strong>Record a punch-in</strong>
            <span>Start someone’s workday</span>
          </div>
          <ArrowUpRight size={18} />
        </button>
        <button disabled={!online} onClick={() => showPunch("out")}>
          <span className="quick-icon mint-bg">
            <LogOut size={19} />
          </span>
          <div>
            <strong>Record a punch-out</strong>
            <span>Make every hour count</span>
          </div>
          <ArrowUpRight size={18} />
        </button>
        <button onClick={onPeople}>
          <span className="quick-icon peach-bg">
            <Users size={19} />
          </span>
          <div>
            <strong>Meet your team</strong>
            <span>People, shifts and departments</span>
          </div>
          <ArrowUpRight size={18} />
        </button>
      </div>
      <button className="quick-insight" onClick={onAttendance}>
        <span className="insight-dot" />
        <span>
          {ready
            ? `${missing} ${missing === 1 ? "person has" : "people have"} no record for this date.`
            : "Your next step: connect, then add your team."}
        </span>
        <ChevronRight size={14} />
      </button>
    </Panel>
  );
}

function AttendanceTable({
  rows,
  employeeMap,
  loading,
  emptyTitle = "No records for this view",
  onCorrect,
  onHistory,
  onPunchOut,
}) {
  if (loading) return <Loading label="Checking attendance…" />;
  if (!rows.length)
    return (
      <Empty icon={Fingerprint} title={emptyTitle}>
        A saved punch-in will appear here. Change the date to explore another
        workday.
      </Empty>
    );
  return (
    <div className="table-scroll">
      <table className="attendance-table">
        <thead>
          <tr>
            <th>Employee</th>
            <th>Status</th>
            <th>Punch in</th>
            <th>Punch out</th>
            <th>Hours</th>
            <th>Details</th>
            <th className="actions-column">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.emp_code}-${row.date}`}>
              <td>
                <Person
                  employee={employeeMap.get(row.emp_code)}
                  code={row.emp_code}
                />
              </td>
              <td>
                <Status value={row.status} />
              </td>
              <td className="tabular">{clock(row.punch_in)}</td>
              <td className="tabular">
                {row.punch_in != null &&
                row.punch_out == null &&
                presence.includes(row.status) ? (
                  <span className="in-progress">
                    <i />
                    Working
                  </span>
                ) : (
                  clock(row.punch_out)
                )}
              </td>
              <td className="tabular">
                {row.work_hours == null
                  ? "—"
                  : `${number(row.work_hours, 2)} h`}
              </td>
              <td>
                <div className="record-details">
                  {row.late_minutes > 0 ? (
                    <span className="mini-tag amber-tag">
                      {row.late_minutes}m late
                    </span>
                  ) : null}
                  {row.overtime_minutes > 0 ? (
                    <span className="mini-tag green-tag">
                      {row.overtime_minutes}m extra
                    </span>
                  ) : null}
                  {row.half_day ? (
                    <span className="mini-tag">Half day</span>
                  ) : null}
                  {row.late_minutes === 0 &&
                  !row.overtime_minutes &&
                  !row.half_day ? (
                    <span className="muted">—</span>
                  ) : null}
                </div>
              </td>
              <td>
                <div className="row-actions">
                  <button
                    className="icon-button"
                    title="Correct this record"
                    aria-label={`Correct attendance for ${row.emp_code}`}
                    onClick={() => onCorrect(row)}
                  >
                    <PencilLine size={16} />
                  </button>
                  <button
                    className="icon-button"
                    title="View correction history"
                    aria-label={`View history for ${row.emp_code}`}
                    onClick={() => onHistory(row)}
                  >
                    <History size={16} />
                  </button>
                  {row.punch_in != null &&
                  row.punch_out == null &&
                  presence.includes(row.status) ? (
                    <button
                      className="icon-button"
                      title="Punch out"
                      aria-label={`Punch out ${row.emp_code}`}
                      onClick={() => onPunchOut(row.emp_code)}
                    >
                      <LogOut size={16} />
                    </button>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SearchField({ value, onChange, placeholder }) {
  return (
    <label className="search-field">
      <Search size={16} />
      <span className="sr-only">{placeholder}</span>
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

function AttendanceView({
  day,
  rows,
  exportedRows,
  employeeMap,
  loading,
  search,
  setSearch,
  ...actions
}) {
  const [status, setStatus] = useState(""),
    [page, setPage] = useState(1);
  const filtered = rows.filter((row) => !status || row.status === status);
  const visiblePage = Math.min(
    page,
    Math.max(1, Math.ceil(filtered.length / 8)),
  );
  const filteredExport = exportedRows.filter(
    (row) => !status || row.status === status,
  );
  return (
    <Panel
      title="Attendance register"
      description={`${prettyDate(day, { weekday: "long", year: "numeric" })} · Times shown in IST`}
      action={
        <ExportButton
          rows={filteredExport}
          columns={exportColumns}
          name={`attendance-${day}.csv`}
        />
      }
    >
      <div className="table-toolbar">
        <div className="filter-tabs" aria-label="Attendance status filter">
          {[
            ["", "All records"],
            ["PRESENT", "In office"],
            ["WFH", "Remote"],
            ["LEAVE", "On leave"],
          ].map(([value, label]) => (
            <button
              key={value}
              className={status === value ? "selected" : ""}
              aria-pressed={status === value}
              onClick={() => {
                setStatus(value);
                setPage(1);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <SearchField
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          placeholder="Search people or department"
        />
      </div>
      <AttendanceTable
        rows={filtered.slice((visiblePage - 1) * 8, visiblePage * 8)}
        employeeMap={employeeMap}
        loading={loading}
        {...actions}
      />
      <Pager page={visiblePage} total={filtered.length} onChange={setPage} />
    </Panel>
  );
}

function PeopleView({
  employees,
  loaded,
  loading,
  search,
  setSearch,
  online,
  onAdd,
  onPunch,
}) {
  const [department, setDepartment] = useState(""),
    [page, setPage] = useState(1);
  const departments = [
    ...new Set(employees.map((employee) => employee.department)),
  ].sort();
  const searchText = search.trim().toLowerCase();
  const filtered = employees.filter(
    (employee) =>
      (!department || employee.department === department) &&
      `${employee.name} ${employee.email} ${employee.emp_code} ${employee.department}`
        .toLowerCase()
        .includes(searchText),
  );
  const visiblePage = Math.min(
    page,
    Math.max(1, Math.ceil(filtered.length / 8)),
  );
  return (
    <>
      <div className="people-intro">
        <div className="people-intro-mark">
          <Users size={34} strokeWidth={1.2} />
        </div>
        <div>
          <span className="eyebrow">THE PEOPLE BEHIND THE PROGRESS</span>
          <h2>One team. Many possibilities.</h2>
          <p>Keep names, shifts and departments in one thoughtful space.</p>
        </div>
        <span className="people-total">
          {loaded && !loading ? employees.length : "—"}
          <small>team members</small>
        </span>
      </div>
      <Panel
        title="Your people"
        description="Employee details and their usual working hours."
      >
        <div className="table-toolbar">
          <SearchField
            value={search}
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            placeholder="Search by name, email or code"
          />
          <label className="compact-select">
            <span className="sr-only">Filter by department</span>
            <select
              value={department}
              onChange={(e) => {
                setDepartment(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All departments</option>
              {departments.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
        </div>
        {loading ? (
          <Loading label="Finding your people…" />
        ) : !filtered.length ? (
          <Empty
            icon={Users}
            title={
              employees.length
                ? "No matching people"
                : "Make room for your first teammate"
            }
            action={
              !employees.length ? (
                <Button
                  icon={Plus}
                  variant="primary"
                  onClick={onAdd}
                  disabled={!online}
                >
                  Add an employee
                </Button>
              ) : null
            }
          >
            {employees.length
              ? "Try a different name or department."
              : "Add a fictional employee to explore shifts, attendance and reports."}
          </Empty>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Email</th>
                  <th>Department</th>
                  <th>Shift · IST</th>
                  <th>Joined</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered
                  .slice((visiblePage - 1) * 8, visiblePage * 8)
                  .map((employee) => (
                    <tr key={employee.emp_code}>
                      <td>
                        <Person employee={employee} code={employee.emp_code} />
                      </td>
                      <td className="muted">{employee.email}</td>
                      <td>
                        <span className="department-tag">
                          {employee.department}
                        </span>
                      </td>
                      <td className="tabular">
                        {employee.shift_start} – {employee.shift_end}
                        {employee.shift_end < employee.shift_start ? (
                          <span className="small-note">Next day</span>
                        ) : null}
                      </td>
                      <td>
                        {prettyDate(employee.joined_on, { year: "numeric" })}
                      </td>
                      <td>
                        <button
                          className="text-button"
                          onClick={() => onPunch(employee.emp_code)}
                        >
                          Punch in <ArrowUpRight size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={visiblePage} total={filtered.length} onChange={setPage} />
      </Panel>
    </>
  );
}

function ReportsView({
  online,
  month,
  employees,
  departments,
  summary,
  revision,
  refresh,
  currentDepartment,
  setDepartment,
  trend,
}) {
  const [employeeCode, setEmployeeCode] = useState("");
  const code = employees.some((e) => e.emp_code === employeeCode)
    ? employeeCode
    : employees[0]?.emp_code || "";
  const monthly = useResource(
    online && code
      ? query(`/analytics/employees/${encodeURIComponent(code)}/monthly`, {
          month,
        })
      : null,
    revision,
  );
  const leaderboard = useResource(
    online ? query("/analytics/leaderboard/late", { month, limit: 5 }) : null,
    revision,
  );
  const report = monthly.data;
  const reportColumns = [
    { key: "department", label: "Department" },
    { key: "headcount", label: "Headcount" },
    { key: "present_days", label: "Present days" },
    { key: "avg_work_hours", label: "Average work hours" },
    { key: "late_count", label: "Late arrivals" },
    { key: "leave_count", label: "Leave records" },
  ];
  return (
    <>
      <div className="report-heading">
        <span className="report-month">
          <CalendarDays size={19} />
          {prettyDate(`${month}-01`, {
            month: "long",
            year: "numeric",
            day: undefined,
          })}
        </span>
        <p>Change the workspace date above to explore another month.</p>
      </div>
      <Panel
        title="One person. The whole month."
        description="Working days count from their joining date. Half days count as 0.5."
        action={
          <label className="compact-select">
            <span className="sr-only">Monthly report employee</span>
            <select
              value={code}
              onChange={(e) => setEmployeeCode(e.target.value)}
              disabled={!employees.length}
            >
              <option value="" disabled>
                Choose a person
              </option>
              {employees.map((e) => (
                <option key={e.emp_code} value={e.emp_code}>
                  {e.name} · {e.emp_code}
                </option>
              ))}
            </select>
          </label>
        }
      >
        {monthly.loading ? (
          <Loading label="Building the monthly view…" />
        ) : monthly.error ? (
          <ErrorMessage error={monthly.error} retry={refresh} />
        ) : !report ? (
          <Empty compact title="Your people make the numbers possible">
            Add an employee to unlock a monthly report.
          </Empty>
        ) : (
          <div className="monthly-grid">
            <div
              className="attendance-donut"
              style={{
                "--rate": `${Math.min(100, report.attendance_pct || 0)}%`,
              }}
            >
              <div>
                <strong>
                  {report.attendance_pct == null
                    ? "—"
                    : `${number(report.attendance_pct, 1)}%`}
                </strong>
                <span>attendance</span>
              </div>
            </div>
            <div className="monthly-facts">
              {[
                ["Present days", number(report.present_days, 1)],
                ["Working days", number(report.working_days)],
                ["Days on leave", number(report.leave_days)],
                ["Late arrivals", number(report.late_count)],
                ["Late minutes", number(report.total_late_minutes)],
                ["Overtime", `${number(report.total_overtime_minutes)} min`],
              ].map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          </div>
        )}
      </Panel>
      <div className="reports-grid">
        <Panel
          title="The department picture"
          description="Monthly totals and average hours from completed workdays."
          action={
            <ExportButton
              label="Export"
              rows={summary.data?.items || []}
              columns={reportColumns}
              name={`departments-${month}.csv`}
            />
          }
        >
          {summary.loading ? (
            <Loading />
          ) : summary.error ? (
            <ErrorMessage error={summary.error} retry={refresh} />
          ) : !summary.data?.items?.length ? (
            <Empty compact title="Start with a department">
              Departments appear when you add people to your team.
            </Empty>
          ) : (
            <div className="department-summaries">
              {summary.data.items.map((row, i) => (
                <div className="department-summary" key={row.department}>
                  <div className="department-summary-name">
                    <span
                      className={`department-symbol department-symbol-${i % 4}`}
                    >
                      <Users size={17} />
                    </span>
                    <div>
                      <strong>{row.department}</strong>
                      <span>
                        {row.headcount}{" "}
                        {row.headcount === 1 ? "person" : "people"}
                      </span>
                    </div>
                    <b>
                      {number(row.avg_work_hours, 2)}
                      <small>avg hours</small>
                    </b>
                  </div>
                  <div className="department-summary-stats">
                    <span>
                      <b>{number(row.present_days, 1)}</b> present days
                    </span>
                    <span>
                      <b>{row.leave_count}</b> leave records
                    </span>
                    <span>
                      <b>{row.late_count}</b> late arrivals
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
        <Panel
          title="Where a little support may help"
          description="Most late minutes this month. Use the context, not just the rank."
        >
          {leaderboard.loading ? (
            <Loading />
          ) : leaderboard.error ? (
            <ErrorMessage error={leaderboard.error} retry={refresh} />
          ) : !leaderboard.data?.items?.length ? (
            <Empty compact icon={Clock3} title="No late arrivals recorded">
              When a late arrival is recorded, it will appear here.
            </Empty>
          ) : (
            <ol className="leaderboard">
              {leaderboard.data.items.map((row) => (
                <li key={row.emp_code}>
                  <span className="rank">{row.rank}</span>
                  <Avatar name={row.name} code={row.emp_code} small />
                  <div>
                    <strong>{row.name}</strong>
                    <span>
                      {row.late_count} late{" "}
                      {row.late_count === 1 ? "arrival" : "arrivals"} ·{" "}
                      {row.department}
                    </span>
                  </div>
                  <b>
                    {row.total_late_minutes}
                    <small>min</small>
                  </b>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>
      <Panel
        title="The longer view"
        description="A 14-day department trend ending on your selected workspace date."
        action={
          <label className="compact-select">
            <span className="sr-only">Trend department</span>
            <select
              value={currentDepartment}
              onChange={(e) => setDepartment(e.target.value)}
              disabled={!departments.length}
            >
              <option value="" disabled>
                Department
              </option>
              {departments.map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
        }
      >
        <TrendChart resource={trend} retry={refresh} />
      </Panel>
    </>
  );
}

function Guide({ onNavigate, online }) {
  const steps = [
    [
      "01",
      "Bring your team together",
      "Open People and add a fictional employee. Give them an employee code, department, joining date and usual shift.",
      "Open People",
      "people",
      Users,
    ],
    [
      "02",
      "Start and finish a workday",
      "Use Punch in to start a record. Choose in office, remote or on duty. Punch out to calculate hours and overtime.",
      "Open Attendance",
      "attendance",
      Fingerprint,
    ],
    [
      "03",
      "Keep the record honest",
      "Use the pencil beside a saved record to correct it. Add your name and a reason. The history button shows every change.",
      "View the register",
      "attendance",
      History,
    ],
    [
      "04",
      "Find the useful patterns",
      "Select a date to set the report month. Explore an employee’s month, department totals and the 14-day attendance trend.",
      "Explore Reports",
      "reports",
      BarChart3,
    ],
  ];
  return (
    <>
      <div className="guide-banner">
        <span>
          <Sparkles size={28} />
        </span>
        <div>
          <h2>
            Less figuring out.
            <br />
            <em>More getting things done.</em>
          </h2>
          <p>Four small steps to a clearer workday.</p>
        </div>
        <div className="guide-status">
          <span
            className={online ? "green-tag mini-tag" : "amber-tag mini-tag"}
          >
            {online
              ? "Your database is connected"
              : "Database setup is pending"}
          </span>
          <p>
            {online
              ? "You’re ready to add your first fictional teammate."
              : "An owner must finish the connection before attendance can be saved."}
          </p>
        </div>
      </div>
      <div className="guide-grid">
        {steps.map(([step, title, text, action, destination, Icon]) => (
          <article className="guide-card" key={step}>
            <div className="guide-card-top">
              <Icon size={22} />
              <span>{step}</span>
            </div>
            <h3>{title}</h3>
            <p>{text}</p>
            <button
              className="text-button"
              onClick={() => onNavigate(destination)}
            >
              {action}
              <ArrowRight size={15} />
            </button>
          </article>
        ))}
      </div>
      <Panel
        title="A few things worth knowing"
        description="Small details that make the numbers easier to understand."
      >
        <div className="faq-list">
          {[
            [
              "Which time zone do you use?",
              "All dates, shifts and form times use India Standard Time (Asia/Kolkata). Your device’s time zone does not change a submitted punch time.",
            ],
            [
              "When does an arrival count as late?",
              "There is a 10-minute grace period after the shift starts. An arrival after that is late; its minutes are measured from the shift start.",
            ],
            [
              "How do half days and overtime work?",
              "Less than 4.5 rounded working hours counts as a half day. Overtime starts when a punch-out is at least 30 minutes after the shift ends. Overnight shifts belong to their starting workday.",
            ],
            [
              "Why are some days blank on the chart?",
              "Working days are Monday through Friday. Weekends have no daily attendance rate. A working day with no attendance has a zero rate when the department has eligible employees.",
            ],
            [
              "Can I use real employee records here?",
              "Use fictional records only. This is a protected assignment demo. It does not include a full employee login or manager permission system. The correction author is a supplied name.",
            ],
            [
              "What if the connection is unavailable?",
              "A clear connection message appears and saved-data actions are disabled. Your data stays in MongoDB. Check the deployment’s database settings, then use Refresh to reconnect.",
            ],
          ].map(([question, answer]) => (
            <details key={question}>
              <summary>
                {question}
                <Plus size={16} />
              </summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
      </Panel>
    </>
  );
}
