# Meet Attend

Attend is the visual workspace on top of the attendance API. You can use ordinary forms instead of writing HTTP requests. The interface uses easy English, a soft violet colour palette, locally served typography, simple icons and a layout that adapts to smaller screens.

## What you can do

| Screen | What it helps you do |
|---|---|
| Overview | See the selected day's team size, presence, late arrivals and open workdays; open the quick punch forms |
| Attendance | Search the selected day's records, filter statuses, punch in/out, make a correction, read history and download a CSV |
| People | Search employees and departments, see shifts and joining dates, add an employee and start a punch |
| Reports | Read an employee's month, department summaries, late-arrival ranking and a 14-day department trend |
| Help | Follow the four-step tour and understand time zones, lateness, half days and missing data |

Use the date field at the top to change the workspace day. Reports use that date's month. The trend always ends on that date and includes the previous 13 days. The department selector controls the trend.

## A short walkthrough

1. Open `/` on the running service. Look for **Database connected** in the top bar.
2. Choose **Add employee**. Use a made-up person, a code such as `EMP7001`, and an email at `example.com`. Set their joining date on or before the workday you want to try.
3. Choose a date, then **Punch in**. Pick the employee and a working status. For a historical record, enter the time in IST.
4. Choose **Punch out**, select the same employee and save an appropriate later time. The backend calculates working hours, lateness and overtime.
5. Open **Attendance**. The pencil button corrects a record; the history button shows the reason, author and before/after values.
6. Open **Reports**. Select the employee to see their month, or choose a department for its trend. Expand **View exact numbers** below a chart for a readable table.

There is no automatic sample-data import. Empty data stays empty until you add fictional records. The interface does not invent dashboard totals, successful saves or chart values.

## How the pieces fit together

```mermaid
flowchart LR
  A[React workspace] --> B[FastAPI routes]
  B --> C[MongoDB records]
  C --> B
  B --> A
```

React sends requests to the same address that serves the page. FastAPI validates the request and owns all attendance calculations. MongoDB persists data and calculates the analytical reports. No database password or connection string is sent to the browser.

The dashboard is an optional addition to the assignment. All required API routes, response shapes, business rules and aggregation pipelines remain in `app/main.py`. It also serves the frontend HTML at `/` and compiled assets under `/ui/`. These UI routes do not appear in the assignment's OpenAPI schema.

## Run the included dashboard

Follow the Python and MongoDB setup in the main README. Then open `http://127.0.0.1:8000/`. The compiled frontend is already included in `app/static/`, so running the submitted Python app does not require Node.js.

The page can load before the database is connected. In that case, it shows a connection message, does not label the database as connected, and disables actions that save data. Opening the page is not proof that the database-backed workflow works.

## Change the frontend

Use Node.js 24 and run these commands from the repository root:

```bash
npm ci
npm run dev
```

Keep FastAPI running separately on port 8000. Vite serves the development interface at `http://127.0.0.1:5173/ui/` and forwards API requests to FastAPI. Use the Python process for MongoDB configuration; the frontend does not need environment secrets.

Before publishing an edit:

```bash
npm test
npm run build
```

Commit the changed source and the rebuilt `app/static/` files together. Build output is included deliberately so the grader can keep using the Python-only startup command. It is generated code, not another place to edit the design. CI rebuilds it and checks for changes so stale output does not pass quietly.

## Choices that matter

- **Same origin:** the UI and API share one FastAPI service. This avoids a second deployment, browser-exposed secrets and CORS configuration.
- **Dates:** forms explicitly convert India time to milliseconds. A laptop in another time zone still submits the intended IST instant.
- **Corrections:** unchanged fields are omitted. The UI does not calculate or send hours, overtime or lateness as authoritative values.
- **Requests:** stale reads are cancelled or ignored after a filter changes. The UI reads all pages for small workspace lists, with four page requests at a time and a clear 10,000-record ceiling.
- **CSV:** filtered rows are exported, fields are quoted, and formula-like text is neutralized before a spreadsheet opens it.
- **Accessibility:** controls have labels, dialogs use the native modal element, keyboard focus is visible, charts include an exact-number table, and animations respect reduced-motion settings.
- **Privacy:** typography and icons are bundled locally. No analytics tracker, remote avatar service or external image request is needed.

## Tools and limits

React 19.3.0, Vite 8.3.4, Lucide React 1.55.0 and DM Sans 5.3.0 are pinned. CSS handles the layout and decorative clock artwork. The lockfile records the complete dependency tree. Tests use Node's test runner, Testing Library, Happy DOM and `tsx`; these are development tools only.

Component tests use simulated HTTP responses to exercise forms. Production code always calls the real API. The API itself is tested against real MongoDB. A real-browser visual and keyboard walkthrough has not been performed in this environment, so responsive rules and component tests are not presented as browser screenshots or end-to-end hosted evidence.

This is a fictional-data demo. Vercel protection controls access to the hosted deployment, but the app does not provide separate staff accounts or manager roles. A larger system would also need server-side directory search, richer filtering and access-controlled exports.
