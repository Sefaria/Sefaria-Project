"""
Tests for webhooks/dispatcher.py — the only place that knows how work reaches a worker.
"""

from datetime import datetime, timezone
from unittest.mock import MagicMock

import pytest
from structlog.testing import capture_logs

from sefaria.donors.types import NormalizedEmailAddress, PersonAsIdentifiedBySalesforce, UserBecameDonorAccordingToSalesforce
from webhooks import dispatcher
from webhooks.dispatcher import EventCouldNotBeEnqueued, ProcessingMode, enqueue_event_for_processing
from webhooks.event_serialization import serialize_event

EVENT = UserBecameDonorAccordingToSalesforce(
    "003:UserBecameDonor:x",
    datetime(2026, 10, 22, tzinfo=timezone.utc),
    PersonAsIdentifiedBySalesforce(
        NormalizedEmailAddress("donor@example.org"), "003", None
    ),
)


@pytest.fixture
def fake_task(monkeypatch):
    task = MagicMock()
    monkeypatch.setattr(
        dispatcher, "process_event_indicating_person_is_donor_task", task
    )
    return task


# ============================================================================
# enqueue_event_for_processing
# ============================================================================


class TestEnqueueEventForProcessing:

    def test_queues_on_the_tasks_queue_when_celery_is_enabled(
        self, monkeypatch, fake_task
    ):
        """In integration and prod the event goes to Celery's general-purpose queue as JSON."""
        monkeypatch.setattr(dispatcher, "CELERY_ENABLED", True)
        assert enqueue_event_for_processing(EVENT) is ProcessingMode.QUEUED
        fake_task.apply_async.assert_called_once_with(
            args=[serialize_event(EVENT)], queue=dispatcher.CeleryQueue.TASKS.value
        )
        fake_task.assert_not_called()

    def test_runs_inline_when_celery_is_disabled(self, monkeypatch, fake_task):
        """Local development has no worker, so the task runs in the request."""
        monkeypatch.setattr(dispatcher, "CELERY_ENABLED", False)
        assert enqueue_event_for_processing(EVENT) is ProcessingMode.INLINE
        fake_task.assert_called_once_with(serialize_event(EVENT))
        fake_task.apply_async.assert_not_called()

    def test_a_broker_failure_becomes_event_could_not_be_enqueued(
        self, monkeypatch, fake_task
    ):
        """Redis down at enqueue time → the view answers 503 and the sender retries, so nothing is lost."""
        monkeypatch.setattr(dispatcher, "CELERY_ENABLED", True)
        fake_task.apply_async.side_effect = ConnectionError("redis down")
        with pytest.raises(EventCouldNotBeEnqueued):
            enqueue_event_for_processing(EVENT)

    def test_a_broker_failure_is_logged_by_type_only(self, monkeypatch, fake_task):
        """Ops can see why events are being refused, without broker error text (it may hold connection strings)."""
        monkeypatch.setattr(dispatcher, "CELERY_ENABLED", True)
        fake_task.apply_async.side_effect = ConnectionError(
            "redis://:password@host down"
        )
        with capture_logs() as logs, pytest.raises(EventCouldNotBeEnqueued):
            enqueue_event_for_processing(EVENT)
        assert [(entry["event"], entry["error_type"]) for entry in logs] == [
            ("donor_event_enqueue_failed", "ConnectionError")
        ]
        assert "password" not in repr(logs)

    def test_a_serialization_bug_is_not_disguised_as_a_broker_failure(
        self, monkeypatch, fake_task
    ):
        """Our own bug must be a 500 that reaches Sentry, not a 503 the sender retries forever."""
        monkeypatch.setattr(dispatcher, "CELERY_ENABLED", True)
        monkeypatch.setattr(
            dispatcher, "serialize_event", MagicMock(side_effect=TypeError("bug"))
        )
        with pytest.raises(TypeError):
            enqueue_event_for_processing(EVENT)
        fake_task.apply_async.assert_not_called()
