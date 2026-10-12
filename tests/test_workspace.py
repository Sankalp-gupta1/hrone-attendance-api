"""The built React workspace must load without changing the API contract."""
import re

from fastapi.testclient import TestClient

from app.main import app


def test_workspace_assets_load_even_before_database_setup(monkeypatch):
    monkeypatch.delenv("MONGO_URI", raising=False)
    monkeypatch.delenv("MONGO_DB", raising=False)
    with TestClient(app) as http:
        page = http.get("/")
        assert page.status_code == 200
        assert "Attend — Your people, in focus" in page.text
        assert page.headers["cache-control"] == "no-cache"
        assets = re.findall(r'(?:src|href)="(/ui/assets/[^"]+)"', page.text)
        assert len(assets) == 2
        for asset in assets:
            response = http.get(asset)
            assert response.status_code == 200 and len(response.content) > 1000
        assert http.get("/health").status_code == 503
        assert http.get("/docs").status_code == 200
        paths = http.get("/openapi.json").json()["paths"]
        assert "/attendance/punch-in" in paths
        assert "/" not in paths  # The assignment's OpenAPI surface stays clean.
