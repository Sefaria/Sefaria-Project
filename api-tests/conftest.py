import os
import pytest
import requests


API_BASE_URL = os.environ.get("API_BASE_URL", "https://www.sefaria.org")


@pytest.fixture(scope="session")
def base_url():
    return API_BASE_URL.rstrip("/")


@pytest.fixture(scope="session")
def api(base_url):
    """Session-scoped requests session with base URL helper."""
    session = requests.Session()
    session.headers.update({"Accept": "application/json"})
    session.base_url = base_url

    class ApiClient:
        def get(self, path, **kwargs):
            kwargs.setdefault("timeout", 30)
            return session.get(f"{base_url}{path}", **kwargs)

        def post(self, path, **kwargs):
            kwargs.setdefault("timeout", 30)
            return session.post(f"{base_url}{path}", **kwargs)

    return ApiClient()
