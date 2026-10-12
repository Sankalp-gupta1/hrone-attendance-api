# Attend — Employee Attendance & Analytics
## Deployed:  https://hrone-attendance-api.vercel.app/  
A calm, readable workspace for an employee attendance register. Add people, record punch-in and punch-out, correct a mistake with a reason, and understand the month through reports. The React dashboard and the FastAPI backend work together with MongoDB.

The important part is what happens around the edges: two punches arriving together, a night shift crossing midnight, an employee with no records, or several people tied in a ranking. The API handles these cases explicitly and keeps correction history.

**The required API is built with Python, FastAPI and MongoDB. All Python application code remains in `app/main.py`.** The optional frontend uses React, Vite and CSS. It calls the same API; the assignment's endpoint contract is unchanged.

## Start here

| You want to… | Open this |
|---|---|
| Understand the project without a technical background | [Plain-English introduction](docs/START_HERE.md) |
| Install it, try requests, and see a full example | [Setup and walkthrough](docs/WALKTHROUGH.md) |
| Understand every file and the important functions | [Code guide](docs/CODE_GUIDE.md) |
| Use or change the React dashboard | [Frontend guide](docs/FRONTEND.md) |
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

Open [the dashboard](http://127.0.0.1:8000/) or [interactive API docs](http://127.0.0.1:8000/docs). The compiled frontend is included, so Node.js is not needed to run the Python service. [Health](http://127.0.0.1:8000/health) returns `{"status":"ok"}` only when MongoDB answers and indexes are ready. Startup creates the indexes automatically; it does not load, clear or replace employee data.

To change the frontend, use Node.js 24, run `npm ci`, edit `src/`, then run `npm test` and `npm run build`. Commit the updated `app/static/` build with the source. The [frontend guide](docs/FRONTEND.md) explains the development workflow and each screen.

## Run the tests

```bash
pip install -r requirements-dev.txt
export MONGO_TEST_URI='mongodb://127.0.0.1:27017'
python -m pytest --require-mongo --run-scale
```

Tests create and remove their own randomly named `hrone_test_…` databases. They never use the application's `MONGO_DB`. Use a local test server. Without `MONGO_TEST_URI`, database tests skip; `--require-mongo` prevents a misleading partial pass.

**Measured locally:** 100 tests passed on MongoDB 7.0.15 and Python 3.12.14, including a 100,000-record check and the actual Uvicorn server command. Every required explain path used `IXSCAN` with no `COLLSCAN` in that dataset.

**Verified on GitHub too:** [both CI jobs passed](https://github.com/Sankalp-gupta1/hrone-attendance-api/actions/runs/38162508865): Python 3.11/MongoDB 6 ran 99 tests (the optional scale test was skipped); Python 3.12/MongoDB 7 ran all 100 tests, including scale. See the [evidence and limits](docs/VERIFICATION.md).

## Hosted demo status

[Open the protected workspace](https://hrone-attendance-api.vercel.app/) or [the API docs](https://hrone-attendance-api.vercel.app/docs). Sign in with the owning Vercel account to open the deployment. The exact build status is recorded in the [deployment guide](docs/DEPLOYMENT.md).

The React dashboard deployment is **READY**. Its [GitHub verification run](https://github.com/Sankalp-gupta1/hrone-attendance-api/actions/runs/38192939259) passed all three jobs: frontend, MongoDB 6 and MongoDB 7 with the scale test.

**Database network access is still pending, so the hosted attendance workflow is not ready to use.** A separate free Atlas cluster and a database user limited to `hrone_demo` are configured. The connection secret is stored as a sensitive Vercel environment variable, and a new deployment is ready. The database's network access list is still empty: allowing any source IP needs the owner's explicit approval. The deployed HTTP routes could not be verified because the deployment-access tool returned 403. See [deployment status and remaining setup](docs/DEPLOYMENT.md). The local and GitHub test results above are separate from these hosted checks.

## Scope and honesty

All required endpoint implementations are present. The frontend adds an overview, people directory, punch forms, corrections, audit history, reports and CSV export. This is an assignment prototype: there is no employee login, manager permission system, holiday calendar or payroll integration. `regularized_by` is a label supplied by the caller, not a verified identity. Only use fictional data in a demo.

AI assistance was used for implementation, documentation and test development. The code was checked against the supplied contract and exercised against real MongoDB. Read the guide and run the examples before presenting or modifying the project in an interview.

The repository should contain no `.env` files, credentials, database dumps, virtual environments or Dockerfile. The original candidate kit is not redistributed here.
