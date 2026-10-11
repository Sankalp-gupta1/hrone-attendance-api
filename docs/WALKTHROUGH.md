# Install it and try one complete day

Everything below runs from the project folder: the folder containing `README.md` and `requirements.txt`. You need Python 3.11 or later and MongoDB 6.0 or later. Python runs the API; MongoDB runs separately and stores the records.

## 1. Start a local test database

If you already have MongoDB running locally, use its connection address and skip the container command. If Docker is installed, this command starts a local MongoDB 7 test server:

```bash
docker run -d --name hrone-mongo -p 127.0.0.1:27017:27017 -v hrone-mongo-data:/data/db mongo:7.0
```

The database listens only on your own computer. The named volume keeps its data when the container stops. To stop it later, run `docker stop hrone-mongo`; to start it again, run `docker start hrone-mongo`. No Dockerfile is required.

If port 27017 is already occupied by MongoDB, use that existing server instead of starting another on the same port.

## 2. Install and start the API

### macOS or Linux

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
export MONGO_URI='mongodb://127.0.0.1:27017'
export MONGO_DB='attendance_demo'
uvicorn app.main:app --port 8000
```

### Windows PowerShell

```powershell
py -3 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
$env:MONGO_URI = 'mongodb://127.0.0.1:27017'
$env:MONGO_DB = 'attendance_demo'
.\.venv\Scripts\uvicorn.exe app.main:app --port 8000
```

`MONGO_URI` is the database address. `MONGO_DB` is the database name. A fresh name gives you a separate demo database. The app creates its indexes at startup but does not create example employees, reset data or load the candidate kit.

The app can read a local `.env`, but the commands above do not need one. Values supplied by the environment take priority. Never add a `.env` or a connection password to Git.

Keep the terminal open. Visit [health](http://127.0.0.1:8000/health). A working connection returns:

```json
{"status": "ok"}
```

## 3. Open the request forms

Visit [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs). For each step below, expand the matching endpoint, press **Try it out**, replace the sample request, then press **Execute**. Look under **Server response**, not the example response shown elsewhere on the page.

`POST` creates or records something, `GET` reads it, and `PATCH` corrects an existing record. Response code **201** means created; **200** means the request succeeded.

## 4. Create an employee

Use `POST /employees`:

```json
{
  "emp_code": "EMP7001",
  "name": "Demo Person",
  "email": "demo@example.com",
  "department": "Engineering",
  "shift_start": "09:30",
  "shift_end": "18:30",
  "joined_on": "2026-07-01"
}
```

Expected: **201**. The response adds `created_at`. The employee code is the identity you use in every later request.

If you run this example twice against the same database, creating the same employee returns **409**. That is correct duplicate protection. Use a fresh demo database name to repeat the entire exercise.

## 5. Record arrival and departure

Use `POST /attendance/punch-in`:

```json
{"emp_code": "EMP7001", "punched_at": 1783311001000, "status": "PRESENT"}
```

This timestamp means **6 July 2026, 09:40:01 IST**. Expected: **201**, `date` is `2026-07-06`, `late_minutes` is `10`, `work_hours` is `null`, and `history` is empty.

Use `POST /attendance/punch-out`:

```json
{"emp_code": "EMP7001", "punched_at": 1783344600000}
```

This is **19:00 IST on the same day**. Expected: **200** with:

```json
{
  "work_hours": 9.33,
  "late_minutes": 10,
  "overtime_minutes": 30,
  "half_day": false
}
```

These are selected fields from the response, not its entire body. Punching out again returns **409** and does not add a second event.

Instants must be integer **milliseconds** since the Unix epoch, without quotation marks. Seconds, floats, strings and explicit `null` are rejected. Omitting `punched_at` uses the current time. Date-only fields stay strings such as `2026-07-06`.

## 6. Correct the arrival time

Use `PATCH /attendance/{emp_code}/{date}` with path values `EMP7001` and `2026-07-06`:

```json
{
  "punch_in": 1783310280000,
  "reason": "Clock was wrong",
  "regularized_by": "Demo Manager"
}
```

The corrected arrival is **09:28 IST**. Expected: **200**, `work_hours: 9.53`, `late_minutes: 0`, and one history entry. Its `changes` contains only `punch_in`, `work_hours` and `late_minutes`, each with `from` and `to` values. Departure and overtime stay unchanged.

Leave a field out to keep it unchanged. Do not send `null`. Sending this identical correction again returns **422**, because it changes nothing. Changing status to `LEAVE` or `ABSENT` clears both punch times automatically; do not supply punch times together with either status.

## 7. Read the saved result and reports

Use these request forms and parameters:

| Endpoint | Parameters | What to check after the correction |
|---|---|---|
| `GET /attendance` | `emp_code=EMP7001` | Total 1; the saved record includes the history entry |
| `GET /analytics/employees/EMP7001/monthly` | `month=2026-07` | 23 working days, 1 present day, attendance 4.35%, late total 0, overtime total 30 |
| `GET /analytics/departments/summary` | `month=2026-07` | Engineering headcount 1, present days 1, average hours 9.53 |
| `GET /analytics/leaderboard/late` | `month=2026-07` | Empty items: the only employee now has zero late minutes |
| `GET /analytics/departments/Engineering/trend` | `from=2026-07-06`, `to=2026-07-12` | Seven daily rows; Monday rate 1, remaining weekdays 0, weekend rates null |

Only use those exact path forms when making requests directly. In the `/docs` form, fill the separate path fields instead of editing the route label.

## 8. See how MongoDB found the records

Use `GET /admin/explain/{endpoint}` with endpoint `employee_monthly`, `emp_code=EMP7001` and `month=2026-07`. The `explain` field is MongoDB's execution plan. `IXSCAN` means an index was scanned. This endpoint uses the same query builder and index hint as the real report.

The other endpoint names are `attendance_list`, `department_summary`, `late_leaderboard` and `department_trend`. Supply the corresponding filters; for trend, supply `department`, `from` and `to`.

## 9. Run the automated checks

Keep MongoDB running. Stop the demo API with Ctrl+C first: one test starts its own server on port 8000. In another terminal with the project environment activated:

```bash
python -m pip install -r requirements-dev.txt
export MONGO_TEST_URI='mongodb://127.0.0.1:27017'
python -m pytest --require-mongo --run-scale
```

On Windows set `$env:MONGO_TEST_URI = 'mongodb://127.0.0.1:27017'` and use `.\.venv\Scripts\python.exe` in place of `python`.

The tests create randomly named databases starting with `hrone_test_` and remove only those databases afterward. They do not use `attendance_demo`. The optional scale test generates its own 100,000 records. No database dump is included.

## If something goes wrong

| What you see | What it means | What to do |
|---|---|---|
| `/health` returns 503 | MongoDB or the required indexes are not ready | Check the server, environment values and database user's permissions; restart after changing configuration |
| 404 | Employee, attendance record or department was not found | Create the employee first; check code and date |
| 409 | A duplicate or concurrent change was rejected | Read the current record; decide whether a new request is still needed |
| 422 | The request breaks a rule | Read `detail`; check time units, date, field lengths and whether the correction changes anything |
| “Address already in use” | Another process uses port 8000 | Stop your previous demo server before starting another or running the server test |
| “No module named…” | Dependencies are missing from this Python environment | Install requirements using that environment's Python |
| Database tests skip | `MONGO_TEST_URI` was not supplied | Set it and add `--require-mongo` |

The docs page uses Swagger UI assets from a CDN. API operations themselves only contact MongoDB. If your browser cannot load the docs assets, send HTTP requests with a client such as curl; the API does not need that CDN to operate.
