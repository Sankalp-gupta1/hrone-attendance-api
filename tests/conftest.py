"""Tests use isolated, disposable databases, never MONGO_DB or application data."""
import os
import uuid

import pytest
from fastapi.testclient import TestClient
from pymongo import MongoClient
from pymongo.errors import PyMongoError

from app import main


def pytest_addoption(parser):
    parser.addoption("--require-mongo", action="store_true", help="Fail instead of skipping when the test MongoDB is unavailable")
    parser.addoption("--run-scale", action="store_true", help="Also run the 100,000-record test")


def pytest_collection_modifyitems(config, items):
    if not config.getoption("--run-scale"):
        for item in items:
            if "scale" in item.keywords:
                item.add_marker(pytest.mark.skip(reason="Pass --run-scale for the 100,000-record check"))


@pytest.fixture
def mongo(request, monkeypatch):
    uri = os.getenv("MONGO_TEST_URI")
    if not uri:
        if request.config.getoption("--require-mongo"):
            pytest.fail("Set MONGO_TEST_URI to a disposable local MongoDB 6.0+ server")
        pytest.skip("MONGO_TEST_URI is not set; only unit tests are being run")
    client = MongoClient(uri, tz_aware=True, serverSelectionTimeoutMS=2000)
    try:
        client.admin.command("ping")
    except PyMongoError:
        client.close()
        if request.config.getoption("--require-mongo"):
            pytest.fail("The test MongoDB server is unavailable")
        pytest.skip("The test MongoDB server is unavailable")
    name = "hrone_test_" + uuid.uuid4().hex
    monkeypatch.setenv("MONGO_URI", uri)
    monkeypatch.setenv("MONGO_DB", name)
    yield client[name]
    # Only this fixture's generated database may be removed.
    assert name.startswith("hrone_test_") and len(name) == 43
    client.drop_database(name)
    client.close()


@pytest.fixture
def api(mongo):
    with TestClient(main.app) as http:
        yield http, mongo
