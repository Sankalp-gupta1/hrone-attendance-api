# Deployment and database connection

The application is deployed as a FastAPI service on Vercel, with the React workspace served from the same application. **Database configuration is complete, a fresh deployment is ready, and all eight application indexes were found in Atlas.** The full hosted attendance workflow still needs a check through an authorized Vercel session. The required submission is the public source repository; hosting is optional.

## Verified frontend deployment: 12 October 2026

| Item | Status |
|---|---|
| Protected React workspace | https://hrone-attendance-api.vercel.app/ |
| API documentation | https://hrone-attendance-api.vercel.app/docs |
| Verified frontend deployment ID | `dpl_AkSK56MiK7C6zt8PYh3yLP53zQ41` |
| Verified frontend source commit | `af2e6a44fdd90e8d64b8c625cbb5bcd0e84823b4` |
| Deployment after saving the database secret | `dpl_FbLXy3gX5bFutmDGRxJY6ukYgpTx`, `READY`; source `9f9561183dc3afc562c3c188c7bfb647b36e5b24` (documentation changes only since the frontend release) |
| Deployment after enabling database network access | `dpl_8g9fzomP173uuRYF5VnvfD4Qrmo6`, `READY`; source `79f8ec02284eaee2946b7924f98666b6d0341b65` (documentation changes only) |
| Vercel build | `READY`, production target, `iad1` region |
| Deployment protection | Vercel Authentication enabled |
| Atlas database | Free cluster; separate `hrone_demo` database |
| Project environment | `MONGO_DB=hrone_demo` configured for production and preview builds |
| Application database login and `MONGO_URI` | Configured; dedicated `readWrite` user restricted to `hrone_demo` on `hrone-demo`; URI stored as a sensitive production/preview environment variable |
| Database network access | `0.0.0.0/0` enabled with the owner's explicit approval on 12 October 2026; database authentication and TLS remain required |
| Application indexes | All eight expected indexes present in Atlas, plus the two default `_id_` indexes |
| Stored records at the setup check | Zero employees and zero attendance records; no sample records were inserted directly into Atlas |
| Hosted HTTP verification | Not completed; Vercel denied protected access with 403, and automatic approval review rejected creating a temporary access link |
| GitHub checks for the frontend source | [All three jobs passed](https://github.com/Sankalp-gupta1/hrone-attendance-api/actions/runs/38192939259): frontend, MongoDB 6 and MongoDB 7 with the scale test |

Vercel's `READY` state confirms the build and deployment completed. The separately observed application indexes in Atlas are evidence that database initialization ran successfully. They do not replace a hosted HTTP health check or an attendance create/punch/correct/report workflow. No successful hosted HTTP response has been captured by the verification tool. The application returns 503 when it cannot reach MongoDB.

The frontend build took about 18 seconds on Vercel. The production alias points to the application, with the dashboard at `/`. The dashboard loads independently of database readiness and clearly reports a missing connection. The recorded deployment above identifies the tested frontend release; later documentation-only commits may have their own deployment IDs with the same application files.

The database user, sensitive `MONGO_URI`, network rule and redeployment are complete. To finish independent hosted verification, use an authorized Vercel session and run the checks below. The connector could deploy the project but could not obtain protected HTTP access: its access request returned 403. A subsequent temporary-link request was rejected by automatic approval review because it would grant access to the protected application. Deployment Protection remains enabled. Never put a connection secret or temporary access token in this repository.

On the current Hobby plan, Vercel uses dynamic outbound IP addresses. MongoDB's [Vercel integration documentation](https://www.mongodb.com/docs/atlas/reference/partner-integrations/vercel/) describes allowing `0.0.0.0/0` for connectivity. The owner explicitly approved this rule for the dedicated assignment project, and the rule is configured. Any IP can attempt a database connection; authentication and TLS still apply, and the application user is limited to `hrone_demo` on `hrone-demo`. A narrower alternative is fixed outbound IPs with only those addresses allowed; [Vercel Static IPs](https://vercel.com/docs/networking/static-ips) require a paid plan and add-on, which have not been enabled.

A separate free Atlas cluster holds the `employees` and `attendance_logs` collections. Connector access, both empty collection counts and all eight application indexes were verified. The [setup evidence](evidence/hosted-setup.json) records these observations and their limits. The database name `hrone_demo` is an environment setting, not a simulated storage mode; the application uses persistent MongoDB collections.

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

Vercel's [official FastAPI documentation](https://vercel.com/docs/frameworks/backend/fastapi) recognizes a FastAPI app exported from `app/main.py`. The included `vercel.json` sets the function's maximum duration to 30 seconds and includes `app/static/`. This folder contains the compiled React dashboard. A Dockerfile and a separate frontend host are not required.

1. Publish the source repository, then import it into an authorized Vercel project.
2. Configure a MongoDB 6.0+ database, such as an Atlas deployment, and a dedicated database user.
3. Add `MONGO_URI` and `MONGO_DB` in Vercel's project environment settings. Enter the connection secret there, not in GitHub or chat.
4. Configure the database's network access for that deployment and enable the project's available deployment protection.
5. Deploy, then open the protected URL through the normal authorized flow.
6. Run the verification below against the deployed API before describing it as working.

Database provisioning, hosting plans and protection features depend on the account. No paid service or new subscription was enabled. The any-IP Atlas rule described above was added with the owner's explicit approval.

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
