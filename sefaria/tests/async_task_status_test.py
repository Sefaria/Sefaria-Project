"""Tests for the GET /api/async/<task_id> task-status endpoint."""

import json
from unittest.mock import patch

from celery.exceptions import TaskRevokedError
from django.test import RequestFactory

from sefaria import views


class _FakeAsyncResult:
    """Stand-in for celery.result.AsyncResult with a fixed state."""

    def __init__(self, state, info=None, ready=None, failed=False, successful=False):
        self.state = state
        self.info = info
        self.result = info
        self._ready = ready
        self._failed = failed
        self._successful = successful

    def ready(self):
        if self._ready is not None:
            return self._ready
        return self.state in ("SUCCESS", "FAILURE", "REVOKED")

    def failed(self):
        return self._failed

    def successful(self):
        return self._successful


def _status_response(result, task_id="task-id"):
    with patch.object(views, "AsyncResult", return_value=result):
        return views.async_task_status_api(RequestFactory().get(f"/api/async/{task_id}"), task_id)


def test_revoked_task_returns_serializable_response_not_500():
    # A revoked task (for example one that expired before a worker picked it up)
    # stores a TaskRevokedError instance in result.info. jsonResponse must never
    # try to JSON-encode that object, or Django turns the poll into an HTTP 500.
    result = _FakeAsyncResult(state="REVOKED", info=TaskRevokedError("expired"))

    response = _status_response(result)

    assert response.status_code == 200
    payload = json.loads(response.content)
    assert payload["state"] == "REVOKED"
    assert payload["ready"] is True
    assert "meta" not in payload
    assert payload["error"] == "expired"


def test_retry_task_with_exception_info_returns_serializable_response():
    # RETRY also stores the retry exception in result.info, not progress meta.
    result = _FakeAsyncResult(state="RETRY", info=RuntimeError("temporary failure"))

    response = _status_response(result)

    assert response.status_code == 202
    payload = json.loads(response.content)
    assert payload["state"] == "RETRY"
    assert "meta" not in payload


def test_started_task_reports_dict_meta():
    result = _FakeAsyncResult(state="STARTED", info={"progress": 42}, ready=False)

    response = _status_response(result)

    assert response.status_code == 202
    payload = json.loads(response.content)
    assert payload["meta"] == {"progress": 42}


def test_failed_task_still_returns_error():
    result = _FakeAsyncResult(state="FAILURE", info=RuntimeError("kaboom"), failed=True)

    response = _status_response(result)

    assert response.status_code == 500
    payload = json.loads(response.content)
    assert payload["error"] == "kaboom"


def test_successful_task_returns_result():
    result = _FakeAsyncResult(state="SUCCESS", info={"title": {"results": []}}, successful=True)

    response = _status_response(result)

    assert response.status_code == 200
    payload = json.loads(response.content)
    assert payload["result"] == {"title": {"results": []}}
