# Hosting a demo

The application is deployable as a FastAPI service with a separate MongoDB database. **This package does not contain a verified live URL.** The required submission is the public source repository; hosting is optional.

A separate free Atlas cluster has been provisioned for the demo, with empty `employees` and `attendance_logs` collections. Connector access was verified. Connecting the deployed application, creating its indexes through startup and running the hosted workflow are still pending; database provisioning alone is not a live API deployment.

The assignment email limits public sharing outside the submitted repository before 15 November 2026. Until then, keep any hosted demonstration protected and share it only through an approved review process. A public marketing/demo page is not needed for this backend assignment.

## Option A: a Python web service

Use a host that supports Python 3.11+, environment variables and a long-running web service.

| Setting | Value |
|---|---|
| Repository root | The folder containing `requirements.txt` |
| Install command | `python -m pip install -r requirements.txt` |
| Start command | `uvicorn app.main:app --host 0.0.0.0 --port "$PORT"` |
| Health check | `/health` |
| `MONGO_URI` | Your database connection string, stored in the host's secret/environment settings |
| `MONGO_DB` | A dedicated database name for fictional demo data |

Use the port variable or fixed port required by your chosen host. The grader's local command stays `uvicorn app.main:app --port 8000`; no hosting-specific code is required.

The database user needs permissions to read/write the two collections and create their indexes. Configure database network access for the hosting environment. Do not put credentials in a file committed to Git or paste them into a public issue.

## Option B: Vercel with MongoDB

Vercel's [official FastAPI documentation](https://vercel.com/docs/frameworks/backend/fastapi) recognizes a FastAPI app exported from `app/main.py`. The included `vercel.json` sets the function's maximum duration to 30 seconds. A Dockerfile is not required.

1. Publish the source repository, then import it into an authorized Vercel project.
2. Configure a MongoDB 6.0+ database, such as an Atlas deployment, and a dedicated database user.
3. Add `MONGO_URI` and `MONGO_DB` in Vercel's project environment settings. Enter the connection secret there, not in GitHub or chat.
4. Configure the database's network access for that deployment and enable the project's available deployment protection.
5. Deploy, then open the protected URL through the normal authorized flow.
6. Run the verification below against the deployed API before describing it as working.

Database provisioning, hosting plans and protection features depend on the account. No paid service, new subscription or public network rule was created by this project.

The service creates indexes during application startup. Repeated starts are safe because the indexes have stable names and definitions. A hosted instance uses a bounded connection pool; a high number of instances would still need connection-budget planning.

## Checks before handing over a URL

| Check | Expected result |
|---|---|
| `GET /health` | 200 and `{"status":"ok"}` |
| `GET /docs` | Interactive API documentation loads in the reviewer's browser |
| Create a fictional employee | 201; no internal MongoDB identifier in the response |
| Punch in and out | Calculated hours, lateness and overtime match the walkthrough |
| Correct one field | One audit entry; unchanged fields are not added to the change list |
| Read again after a restart/redeploy | Data still exists in MongoDB |
| Run a report and its explain | Correct result and the expected index-backed query |
| Open as the intended reviewer | Protection permits that reviewer, without exposing credentials |

The current local results do not replace these hosted checks. A failed database connection must produce a 503 health response rather than a misleading successful demo.

## Submission preparation

Keep the source repository public until 31 October 2026, as requested in the email. Check that its root contains `app/main.py`, `requirements.txt`, `REVIEW.md`, `DECISIONS.md` and `README.md`. Do not add the candidate kit, sample-data dumps, `.env`, credentials, a virtual environment or a Dockerfile.

Submit the actual repository URL in the employer's form using the email you applied with, before **15 October 2026, 11:59 PM IST**. A ZIP is useful for transfer, but does not replace the public repository link requested in the email. Run the walkthrough yourself before submission so you can explain and modify the implementation in the live discussion.
