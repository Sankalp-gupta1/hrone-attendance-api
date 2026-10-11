"""Exercise the documented Uvicorn entry point through real HTTP requests."""
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx
import pytest

pytestmark = pytest.mark.integration


def test_documented_server_command_and_complete_workflow(mongo, tmp_path):
    project = Path(__file__).resolve().parents[1]
    executable = str(Path(sys.executable).with_name("uvicorn.exe" if os.name == "nt" else "uvicorn"))
    command = [executable, "app.main:app", "--port", "8000"]
    started = time.perf_counter()
    with (tmp_path / "server.log").open("w") as output:
        process = subprocess.Popen(command, cwd=project, env=os.environ.copy(),
                                   stdout=output, stderr=subprocess.STDOUT)
        try:
            with httpx.Client(base_url="http://127.0.0.1:8000", timeout=10, trust_env=False) as http:
                while True:
                    assert process.poll() is None, "Uvicorn exited before it was ready"
                    try:
                        if http.get("/health").status_code == 200:
                            break
                    except httpx.ConnectError:
                        pass
                    assert time.perf_counter() - started < 20, "Server was not healthy within 20 seconds"
                    time.sleep(0.1)
                startup = time.perf_counter() - started
                assert http.get("/docs").status_code == 200
                assert "/attendance/punch-out" in http.get("/openapi.json").json()["paths"]
                person = {"emp_code": "EMP7001", "name": "Demo Person", "email": "demo@example.com",
                          "department": "Engineering", "joined_on": "2026-07-01"}
                assert http.post("/employees", json=person).status_code == 201
                pin = http.post("/attendance/punch-in", json={"emp_code": "EMP7001", "punched_at": 1783311001000})
                assert pin.status_code == 201 and pin.json()["late_minutes"] == 10
                out = http.post("/attendance/punch-out", json={"emp_code": "EMP7001", "punched_at": 1783344600000})
                assert out.status_code == 200
                assert (out.json()["work_hours"], out.json()["overtime_minutes"]) == (9.33, 30)
                fixed = http.patch("/attendance/EMP7001/2026-07-06", json={"punch_in": 1783310280000,
                    "reason": "Clock was wrong", "regularized_by": "Demo Manager"})
                assert fixed.status_code == 200
                corrected = fixed.json()
                assert corrected["work_hours"] == 9.53 and corrected["late_minutes"] == 0
                assert len(corrected["history"]) == 1
                listed = http.get("/attendance", params={"emp_code": "EMP7001"}).json()
                assert listed["total"] == 1 and listed["items"][0] == corrected
                monthly = http.get("/analytics/employees/EMP7001/monthly", params={"month": "2026-07"})
                assert monthly.status_code == 200
                assert monthly.json()["attendance_pct"] == 4.35
                assert monthly.json()["working_days"] == 23
                stored = mongo.attendance_logs.find_one({"emp_code": "EMP7001"})
                assert isinstance(stored["punch_in"], datetime) and len(stored["history"]) == 1
                assert len(mongo.employees.index_information()) == 5
                assert len(mongo.attendance_logs.index_information()) == 5
                evidence = {"command": "uvicorn app.main:app --port 8000",
                    "transport": "real HTTP to a separate Uvicorn process",
                    "startup_seconds": round(startup, 3),
                    "verified": ["health", "interactive docs route", "OpenAPI route", "create employee",
                        "punch in", "punch out", "correction with audit history", "read persisted record",
                        "monthly report", "BSON datetime storage", "startup indexes"],
                    "measured_at_utc": datetime.now(timezone.utc).isoformat()}
                destination = project / "test-results"
                destination.mkdir(exist_ok=True)
                (destination / "server-evidence.json").write_text(json.dumps(evidence, indent=2) + "\n")
        finally:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
