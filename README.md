# Employee Attendance & Analytics API

A small backend that keeps a reliable attendance register. Employees can punch in and out. A manager can correct a mistake with a reason. Reports show attendance, late arrivals and department trends.

The important part is what happens around the edges: two punches arriving together, a night shift crossing midnight, an employee with no records, or several people tied in a ranking. The API handles these cases explicitly and keeps correction history.

**Built with Python, FastAPI and MongoDB. All application code is in `app/main.py`.**

## Start here

| You want to… | Open this |
|---|---|
| Understand the project without a technical background | [Plain-English introduction](docs/START_HERE.md) |
| Install it, try requests, and see a full example | [Setup and walkthrough](docs/WALKTHROUGH.md) |
| Understand every file and the important functions | [Code guide](docs/CODE_GUIDE.md) |
| See the starter defects and fixes | [Code review](REVIEW.md) |
| Read the five design answers | [Design decisions](DECISIONS.md) |
| Check tests, measurements and remaining limits | [Verification](docs/VERIFICATION.md) |
| Host a protected demo | [Deployment guide](docs/DEPLOYMENT.md) |

## Run locally

You need **Python 3.11+** and a running **MongoDB 6.0+** server. Run these commands from the folder containing this README:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export MONGO_URI='mongodb://127.0.0.1:27017'
export MONGO_DB='attendance_demo'
uvicorn app.main:app --port 8000
```

Windows PowerShell commands and an optional local MongoDB container command are in the [walkthrough](docs/WALKTHROUGH.md). No Dockerfile is needed or included.

Open [interactive API docs](http://127.0.0.1:8000/docs). [Health](http://127.0.0.1:8000/health) returns `{"status":"ok"}` only when MongoDB answers and indexes are ready. Startup creates the indexes automatically; it does not load, clear or replace employee data.

## Run the tests

```bash
pip install -r requirements-dev.txt
export MONGO_TEST_URI='mongodb://127.0.0.1:27017'
python -m pytest --require-mongo --run-scale
```

Tests create and remove their own randomly named `hrone_test_…` databases. They never use the application's `MONGO_DB`. Use a local test server. Without `MONGO_TEST_URI`, database tests skip; `--require-mongo` prevents a misleading partial pass.

**Measured locally:** 100 tests passed on MongoDB 7.0.15 and Python 3.12.14, including a 100,000-record check and the actual Uvicorn server command. Every required explain path used `IXSCAN` with no `COLLSCAN` in that dataset. See the [evidence and limits](docs/VERIFICATION.md). GitHub CI and hosted deployment are not yet verified.

## Scope and honesty

All required endpoint implementations are present. This is an assignment API, not a complete HR product: no login, manager permissions, holiday calendar or payroll integration. `regularized_by` is a label supplied by the caller, not a verified identity. Only use fictional data in a demo.

AI assistance was used for implementation, documentation and test development. The code was checked against the supplied contract and exercised against real MongoDB. Read the guide and run the examples before presenting or modifying the project in an interview.

The repository should contain no `.env` files, credentials, database dumps, virtual environments or Dockerfile. The original candidate kit is not redistributed here.
