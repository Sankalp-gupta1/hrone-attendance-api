// These component tests use a DOM simulator and HTTP fixtures, not a real browser.
import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";
import React from "react";

const window = new Window({ url: "http://localhost/" });
for (const key of [
  "window",
  "document",
  "HTMLElement",
  "HTMLDialogElement",
  "Node",
  "MutationObserver",
  "navigator",
  "getComputedStyle",
  "FormData",
]) {
  const value =
    key === "window"
      ? window
      : key === "getComputedStyle"
        ? window.getComputedStyle.bind(window)
        : window[key];
  Object.defineProperty(globalThis, key, {
    value,
    configurable: true,
    writable: true,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { render, screen, waitFor, cleanup, fireEvent } =
  await import("@testing-library/react");
const { default: userEvent } = await import("@testing-library/user-event");
const { default: App } = await import("./App.jsx");
const { CorrectionForm } = await import("./forms.jsx");
const { api, allPages } = await import("./lib/api.js");
const originalFetch = globalThis.fetch;
const person = {
  emp_code: "EMP1001",
  name: "Alex Morgan",
  email: "alex@example.com",
  department: "Engineering",
  shift_start: "09:30",
  shift_end: "18:30",
  joined_on: "2026-01-01",
};
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
  window.location.hash = "";
});

function fixture(handlers = {}) {
  const calls = [];
  globalThis.fetch = async (path, options = {}) => {
    calls.push({ path, options });
    const url = new URL(path, "http://localhost");
    const handler = handlers[`${options.method || "GET"} ${url.pathname}`];
    if (handler) return handler(options, url);
    if (url.pathname === "/health") return json({ status: "ok" });
    if (url.pathname === "/employees")
      return json({ items: [person], total: 1, page: 1, page_size: 100 });
    if (url.pathname === "/attendance")
      return json({ items: [], total: 0, page: 1, page_size: 100 });
    if (url.pathname.startsWith("/analytics")) return json({ items: [] });
    throw new Error(`Unexpected test request: ${path}`);
  };
  return calls;
}

test("an unavailable database disables writes and never pretends it is connected", async () => {
  const calls = fixture({
    "GET /health": () => json({ detail: "Database is not configured" }, 503),
  });
  render(<App />);
  await screen.findByText("Let’s connect your workspace.");
  assert.equal(
    screen.getByRole("button", { name: "Add employee" }).disabled,
    true,
  );
  assert.equal(
    screen.getByRole("button", { name: /Record a punch-in/ }).disabled,
    true,
  );
  assert.equal(screen.queryByText("Database connected"), null);
  assert.equal(
    calls.some((call) => call.path.startsWith("/employees")),
    false,
  );
});

test("employee creation sends validated form values to the real API path and shows success only after a response", async () => {
  let submitted;
  const calls = fixture({
    "POST /employees": (options) => {
      submitted = JSON.parse(options.body);
      return json(submitted, 201);
    },
  });
  render(<App />);
  await screen.findByText("Database connected");
  await waitFor(() =>
    assert.equal(
      screen.getByRole("button", { name: "Add employee" }).disabled,
      false,
    ),
  );
  const user = userEvent.setup({ document: window.document });
  await user.click(screen.getByRole("button", { name: "Add employee" }));
  await user.type(screen.getByLabelText("Full name"), "Jamie Lee");
  await user.type(screen.getByLabelText("Work email"), "jamie@example.com");
  await user.type(screen.getByLabelText("Department"), "Design");
  await user.click(
    screen.getAllByRole("button", { name: "Add employee" }).at(-1),
  );
  await screen.findByText("Jamie Lee was added to your team.");
  assert.equal(submitted.name, "Jamie Lee");
  assert.equal(submitted.department, "Design");
  assert.match(submitted.emp_code, /^EMP[0-9]{4,6}$/);
  assert.equal(submitted.shift_start, "09:30");
  assert.equal(
    calls.filter((call) => call.options.method === "POST").length,
    1,
  );
});

test("a historical punch-in is submitted as an IST instant with the selected working status", async () => {
  let submitted;
  fixture({
    "POST /attendance/punch-in": (options) => {
      submitted = JSON.parse(options.body);
      return json({ ...submitted, date: "2026-10-01" }, 201);
    },
  });
  render(<App />);
  await screen.findByText("Database connected");
  fireEvent.change(screen.getByLabelText("Workspace date"), {
    target: { value: "2026-10-01" },
  });
  const user = userEvent.setup({ document: window.document });
  await user.click(screen.getByRole("button", { name: /Record a punch-in/ }));
  await user.selectOptions(screen.getByLabelText("Employee"), "EMP1001");
  await user.selectOptions(screen.getByLabelText("Working from"), "WFH");
  await user.click(screen.getByRole("button", { name: "Save punch-in" }));
  await screen.findByText(/Punch-in saved for EMP1001/);
  assert.equal(submitted.punched_at, Date.parse("2026-10-01T04:00:00Z"));
  assert.equal(submitted.status, "WFH");
});

test("a correction retains its reason and author and does not send client-calculated hours", async () => {
  let submitted,
    saved = false;
  const record = {
    emp_code: "EMP1001",
    date: "2026-10-01",
    status: "PRESENT",
    punch_in: Date.parse("2026-10-01T04:00:00Z"),
    punch_out: null,
    history: [],
  };
  fixture({
    "PATCH /attendance/EMP1001/2026-10-01": (options) => {
      submitted = JSON.parse(options.body);
      return json({ ...record, history: [{ reason: submitted.reason }] });
    },
  });
  render(
    <CorrectionForm
      record={record}
      employee={person}
      onClose={() => {}}
      onSaved={() => {
        saved = true;
      }}
    />,
  );
  const user = userEvent.setup({ document: window.document });
  await user.selectOptions(screen.getByLabelText("Attendance status"), "WFH");
  await user.type(
    screen.getByLabelText("Your name", { exact: false }),
    "Demo Manager",
  );
  await user.type(
    screen.getByLabelText("What changed, and why?"),
    "Confirmed a remote workday",
  );
  await user.click(screen.getByRole("button", { name: "Save correction" }));
  await waitFor(() => assert.equal(saved, true));
  assert.deepEqual(submitted, {
    reason: "Confirmed a remote workday",
    regularized_by: "Demo Manager",
    status: "WFH",
  });
});

test("HTML login responses are reported as an access problem instead of a false data result", async () => {
  globalThis.fetch = async () =>
    new Response("<html>Sign in</html>", {
      status: 200,
      headers: { "Content-Type": "text/html" },
    });
  await assert.rejects(api("/health"), /Sign in to the owning Vercel account/);
});

test("paginated employee loading includes later pages rather than silently truncating the team", async () => {
  globalThis.fetch = async (path) => {
    const page = Number(
      new URL(path, "http://localhost").searchParams.get("page"),
    );
    return json({
      items: [{ emp_code: `EMP${page}001` }],
      total: 201,
      page,
      page_size: 100,
    });
  };
  const result = await allPages("/employees");
  assert.deepEqual(
    result.items.map((item) => item.emp_code),
    ["EMP1001", "EMP2001", "EMP3001"],
  );
});
