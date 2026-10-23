"""
The Celery task that processes one donor event. A thin wrapper: decode, call the domain,
retry what is transient.

Conventions follow sefaria/helper/crm/tasks.py: bind=True (so the task receives itself as
`self` and can read self.request and call self.retry), acks_late, and ignore_result.
"""

from typing import Any

import requests
import structlog
from django.db import InterfaceError as DatabaseInterfaceError
from django.db import OperationalError as DatabaseOperationalError
from pymongo.errors import AutoReconnect

from sefaria.celery_setup.app import app
from sefaria.donors.event_processing import process_event_indicating_person_is_donor
from webhooks.adapters.classy_api import ClassyApiTemporaryFailure, look_up_classy_supporter_email_address
from webhooks.event_serialization import deserialize_event

logger = structlog.get_logger(__name__)

# Failures a later attempt can fix. Everything else (bad credentials or a payload bug, for
# example) fails the task immediately instead of being retried, so it shows up as a failure.
# The retries span about 15 minutes in total. After the last one the message is acknowledged
# and gone, so an outage longer than that needs a manual replay of the event.
#
# The two Django database errors cover Postgres, where the Sefaria account is looked up by email
# address. A dropped or failed-over connection raises OperationalError, and a connection that
# was already closed raises InterfaceError. Celery's Django fixup already closes stale
# connections before each task starts, so these only happen when the database goes away
# partway through a task. They can also mean a configuration problem such as a wrong password;
# that case is retried five times for nothing and then fails like any other error.
TRANSIENT_ERRORS = (
    requests.Timeout,
    requests.ConnectionError,
    ClassyApiTemporaryFailure,
    AutoReconnect,
    DatabaseOperationalError,
    DatabaseInterfaceError,
)
MAX_RETRIES = 5


def retry_countdown_seconds(retries_so_far: int) -> int:
    # Exponential backoff: 30s, 60s, 120s, 240s, 480s (the largest ever used, with MAX_RETRIES = 5).
    return 30 * 2**retries_so_far


@app.task(
    bind=True,
    name="webhooks.process_event_indicating_person_is_donor",
    max_retries=MAX_RETRIES,
    # The sender already got a 202, so a lost message is a lost donation. acks_late keeps the
    # message unacknowledged until the task finishes, but on its own that only covers the whole
    # worker going away. When just the child process running the task dies (OOM kill, SIGKILL),
    # the surviving parent sees WorkerLostError and acknowledges the message unless
    # reject_on_worker_lost is set, which makes it put the message back on the queue instead.
    # The cost: a task that kills its process every time would be redelivered forever. This task
    # only decodes a small dict and makes a few lookups, so that isn't a realistic risk here.
    acks_late=True,
    reject_on_worker_lost=True,
    ignore_result=True,
)
def process_event_indicating_person_is_donor_task(
    self: Any, serialized_event: dict
) -> None:
    event = deserialize_event(serialized_event)
    try:
        process_event_indicating_person_is_donor(
            event, look_up_classy_supporter_email_address
        )
    except TRANSIENT_ERRORS as error:
        if self.request.retries >= self.max_retries:
            logger.error(
                "donor_event_processing_gave_up",
                event_id_assigned_by_source=event.event_id_assigned_by_source,
                error_type=type(error).__name__,
            )
            # Re-raised so Celery marks the task failed. Celery workers don't start Sentry yet
            # (web processes start it in gunicorn's post_fork), so the donor_event_processing_gave_up
            # line above is what shows that a donation was dropped. Alert on that log event.
            raise
        if self.request.called_directly:
            # Inline mode (no worker, local development): nothing will retry this task, so the error
            # surfaces as a 500 and the webhook sender retries instead.
            raise
        logger.warning(
            "donor_event_processing_retrying",
            event_id_assigned_by_source=event.event_id_assigned_by_source,
            error_type=type(error).__name__,
            attempt=self.request.retries + 1,
        )
        raise self.retry(
            exc=error, countdown=retry_countdown_seconds(self.request.retries)
        )
