"""
Tests for webhooks/tasks.py.

The task is run through Celery's own machinery (`.apply()` executes synchronously, in-process)
or through `.run()` with a pushed request context to simulate a given retry count. Mongo is
mocked at the one write boundary: sefaria.donors.donor_recording.apply_update_to_user_profile.
"""

from contextlib import contextmanager
from datetime import datetime, timezone
from unittest.mock import MagicMock

import pytest
import requests
from billiard.einfo import ExceptionInfo
from billiard.exceptions import WorkerLostError
from celery.contrib.testing.mocks import TaskMessage
from celery.exceptions import Retry
from celery.worker.request import Request
from structlog.testing import capture_logs

from sefaria.donors import donor_recording
from sefaria.donors.types import (
    DonationReceivedFromClassy,
    DonorEmailAddressCouldNotBeResolved,
    NormalizedEmailAddress,
    PersonAsIdentifiedByClassy,
)
from sefaria.donors.types import ReasonDonorEmailAddressCouldNotBeResolved as Reason
from webhooks import tasks
from webhooks.event_serialization import serialize_event
from webhooks.tasks import MAX_RETRIES, process_event_indicating_person_is_donor_task

OCCURRED_AT = datetime(2026, 10, 22, 14, 3, 11, tzinfo=timezone.utc)
CLASSY_EVENT_WITHOUT_ADDRESS = DonationReceivedFromClassy("msg_1", OCCURRED_AT, PersonAsIdentifiedByClassy(5827, None), 99)


@pytest.fixture
def profile_writes(monkeypatch):
    writes = []
    monkeypatch.setattr(donor_recording, "find_user_id_ensuring_profile_document", lambda email: 7)
    monkeypatch.setattr(donor_recording, "apply_update_to_user_profile", lambda user_id, update: writes.append((user_id, update)) or True)
    return writes


@contextmanager
def running_as_retry_number(retries_so_far):
    """Run `task.run(...)` as a worker would on its Nth attempt (called_directly=False)."""
    task = process_event_indicating_person_is_donor_task
    task.push_request(retries=retries_so_far, called_directly=False)
    try:
        yield
    finally:
        task.pop_request()


def lookup_raising(error):
    def failing_lookup(supporter_id):
        raise error
    return failing_lookup


# ============================================================================
# process_event_indicating_person_is_donor_task
# ============================================================================

class TestProcessEventTask:

    def test_writes_the_exact_profile_update(self, monkeypatch, profile_writes):
        """End of the flow: the profile update sent to Mongo is exactly the decided pipeline."""
        monkeypatch.setattr(tasks, "look_up_classy_supporter_email_address", lambda supporter_id: NormalizedEmailAddress("donor@example.org"))

        process_event_indicating_person_is_donor_task.apply(args=[serialize_event(CLASSY_EVENT_WITHOUT_ADDRESS)])

        assert profile_writes == [(7, [{"$set": {"donor_status": "donor", "became_donor_at": {"$min": ["$became_donor_at", OCCURRED_AT]}}}])]

    @pytest.mark.parametrize("transient_error", [
        requests.Timeout("slow"),
        requests.ConnectionError("down"),
        tasks.ClassyApiTemporaryFailure("503"),
        tasks.AutoReconnect("mongo failover"),
        tasks.DatabaseOperationalError("postgres connection lost"),
        tasks.DatabaseInterfaceError("postgres connection already closed"),
    ])
    def test_transient_errors_are_retried(self, monkeypatch, profile_writes, transient_error):
        """Timeouts, temporary Classy failures, and Mongo or Postgres connection loss schedule a retry with backoff."""
        monkeypatch.setattr(tasks, "look_up_classy_supporter_email_address", lookup_raising(transient_error))
        scheduled = []
        monkeypatch.setattr(process_event_indicating_person_is_donor_task, "retry",
                            lambda exc, countdown: scheduled.append(countdown) or Retry())

        with running_as_retry_number(0), pytest.raises(Retry):
            process_event_indicating_person_is_donor_task.run(serialize_event(CLASSY_EVENT_WITHOUT_ADDRESS))
        assert scheduled == [tasks.retry_countdown_seconds(0)]

    def test_gives_up_after_the_last_retry_by_raising(self, monkeypatch, profile_writes):
        """After MAX_RETRIES the original error propagates, so Celery marks the task failed."""
        monkeypatch.setattr(tasks, "look_up_classy_supporter_email_address", lookup_raising(requests.Timeout("still slow")))
        with running_as_retry_number(MAX_RETRIES), pytest.raises(requests.Timeout):
            process_event_indicating_person_is_donor_task.run(serialize_event(CLASSY_EVENT_WITHOUT_ADDRESS))

    def test_a_non_transient_error_is_never_retried(self, monkeypatch, profile_writes):
        """Bad credentials (HTTPError) cannot be fixed by waiting, so the task fails at once."""
        monkeypatch.setattr(tasks, "look_up_classy_supporter_email_address", lookup_raising(requests.HTTPError("401")))
        retry = MagicMock()
        monkeypatch.setattr(process_event_indicating_person_is_donor_task, "retry", retry)

        with running_as_retry_number(0), pytest.raises(requests.HTTPError):
            process_event_indicating_person_is_donor_task.run(serialize_event(CLASSY_EVENT_WITHOUT_ADDRESS))
        retry.assert_not_called()

    def test_called_directly_propagates_the_error_without_scheduling_a_retry(self, monkeypatch, profile_writes):
        """Inline mode (no worker): nothing could run a retry, so the original error surfaces for a 500."""
        monkeypatch.setattr(tasks, "look_up_classy_supporter_email_address", lookup_raising(requests.Timeout("slow")))
        with capture_logs() as logs, pytest.raises(requests.Timeout):
            process_event_indicating_person_is_donor_task(serialize_event(CLASSY_EVENT_WITHOUT_ADDRESS))
        assert "donor_event_processing_retrying" not in [entry["event"] for entry in logs]

    def test_unresolvable_addresses_finish_without_retrying(self, monkeypatch, profile_writes):
        """Retrying can't change 'not found', so the task finishes cleanly and writes nothing."""
        monkeypatch.setattr(tasks, "look_up_classy_supporter_email_address",
                            lambda supporter_id: DonorEmailAddressCouldNotBeResolved(Reason.CLASSY_SUPPORTER_NOT_FOUND))
        result = process_event_indicating_person_is_donor_task.apply(args=[serialize_event(CLASSY_EVENT_WITHOUT_ADDRESS)])
        assert result.successful()
        assert profile_writes == []

    def test_retry_backoff_doubles_each_attempt(self):
        """30s, 60s, 120s, 240s, 480s: the delays used across all MAX_RETRIES retries."""
        assert [tasks.retry_countdown_seconds(n) for n in range(MAX_RETRIES)] == [30, 60, 120, 240, 480]

    def test_task_options(self):
        """Results are never stored; the name is what the dispatcher sends."""
        assert process_event_indicating_person_is_donor_task.name == "webhooks.process_event_indicating_person_is_donor"
        assert process_event_indicating_person_is_donor_task.ignore_result is True
        assert process_event_indicating_person_is_donor_task.max_retries == MAX_RETRIES

    def test_the_number_of_retries_is_the_one_the_docs_promise(self):
        """
        docs/agent_docs/apps/README.md and the retry comment in tasks.py both promise five
        retries (about 15 minutes), so changing the number has to update them too.
        """
        assert MAX_RETRIES == 5


class TestWorkerProcessDyingMidTask:
    """
    What the worker does with the broker message when the child process running the task is
    killed. Runs Celery's own Request.on_failure, the code that decides between acknowledging
    (message gone) and rejecting with requeue (message delivered again), with the WorkerLostError
    the parent process raises in that situation.
    """

    def broker_message_outcome_after_worker_lost(self):
        on_ack, on_reject = MagicMock(), MagicMock()
        request = Request(TaskMessage(process_event_indicating_person_is_donor_task.name, args=({},)),
                          app=process_event_indicating_person_is_donor_task.app,
                          task=process_event_indicating_person_is_donor_task,
                          on_ack=on_ack, on_reject=on_reject)
        try:
            raise WorkerLostError("Worker exited prematurely: signal 9 (SIGKILL).")
        except WorkerLostError:
            request.on_failure(ExceptionInfo())
        return on_ack, on_reject

    def test_the_message_is_requeued_instead_of_acknowledged(self):
        on_ack, on_reject = self.broker_message_outcome_after_worker_lost()

        on_ack.assert_not_called()
        on_reject.assert_called_once()
        requeue = on_reject.call_args.args[2]
        assert requeue is True

    def test_without_reject_on_worker_lost_the_message_would_be_lost(self, monkeypatch):
        """Pins why the option is set: acks_late alone acknowledges, so the donation would be gone."""
        monkeypatch.setattr(process_event_indicating_person_is_donor_task, "reject_on_worker_lost", False)

        on_ack, on_reject = self.broker_message_outcome_after_worker_lost()

        on_ack.assert_called_once()
        on_reject.assert_not_called()
