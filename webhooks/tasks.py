"""
The Celery task that processes one donor event. A thin wrapper: decode, call the domain,
retry what is transient.

Conventions follow sefaria/helper/crm/tasks.py (bind=True, acks_late, ignore_result,
explicit self.retry).
"""

from typing import Any

import requests
import structlog
from pymongo.errors import AutoReconnect

from sefaria.celery_setup.app import app
from sefaria.donors.event_processing import process_event_indicating_person_is_donor
from webhooks.adapters.classy_api import ClassyApiServerError, look_up_classy_supporter_email_address
from webhooks.event_serialization import deserialize_event

logger = structlog.get_logger(__name__)

# Failures a later attempt can fix. Everything else (bad credentials or a payload bug, for
# example) fails the task immediately so it reaches Sentry instead of being retried.
# The retries span about 15 minutes in total. After the last one the message is acknowledged
# and gone, so an outage longer than that needs a manual replay of the event.
TRANSIENT_ERRORS = (requests.Timeout, requests.ConnectionError, ClassyApiServerError, AutoReconnect)
MAX_RETRIES = 5


def retry_countdown_seconds(retries_so_far: int) -> int:
    # Exponential backoff: 30s, 60s, 120s, 240s, 480s (the largest ever used, with MAX_RETRIES = 5).
    return 30 * 2 ** retries_so_far


@app.task(
    bind=True,
    name="webhooks.process_event_indicating_person_is_donor",
    max_retries=MAX_RETRIES,
    acks_late=True,      # a worker that dies mid-task leaves the message to be re-delivered
    ignore_result=True,
)
def process_event_indicating_person_is_donor_task(self: Any, serialized_event: dict) -> None:
    event = deserialize_event(serialized_event)
    try:
        process_event_indicating_person_is_donor(event, look_up_classy_supporter_email_address)
    except TRANSIENT_ERRORS as error:
        if self.request.retries >= self.max_retries:
            logger.error(
                "donor_event_processing_gave_up",
                event_id_assigned_by_source=event.event_id_assigned_by_source,
                error_type=type(error).__name__,
            )
            # Re-raised so Celery marks the task failed. Sentry's Celery integration (enabled
            # automatically by sentry_sdk.init) reports it from there.
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
        raise self.retry(exc=error, countdown=retry_countdown_seconds(self.request.retries))
