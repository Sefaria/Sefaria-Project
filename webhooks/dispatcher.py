"""
How an accepted event reaches processing. The view calls this one function and never
touches Celery. That keeps a possible future "inbox" contained here: a database table that
records every accepted event before it is queued, so a task lost after the 202 could be
replayed. Adding it would change only this function and the task wrapper.
"""

from enum import Enum

import structlog

from sefaria.celery_setup.config import CeleryQueue
from sefaria.donors.types import EventIndicatingPersonIsDonor
from sefaria.settings import CELERY_ENABLED
from webhooks.event_serialization import serialize_event
from webhooks.tasks import process_event_indicating_person_is_donor_task

logger = structlog.get_logger(__name__)


class ProcessingMode(Enum):
    # Sent in the 202 body: e2e-tests/tests/strapi-donor-webhook-flow.spec.js reads it to know
    # whether to wait for a worker at all.
    QUEUED = "queued"
    INLINE = "inline"


class EventCouldNotBeEnqueued(Exception):
    """The broker refused the task. The view answers 503 so the sender retries."""


def enqueue_event_for_processing(event: EventIndicatingPersonIsDonor) -> ProcessingMode:
    # Outside the try on purpose: a serialization bug is OUR bug. It must surface as a 500 that
    # reaches Sentry, not as a 503 that makes the sender retry the same broken event forever.
    serialized_event = serialize_event(event)
    if CELERY_ENABLED:
        try:
            process_event_indicating_person_is_donor_task.apply_async(
                args=[serialized_event], queue=CeleryQueue.TASKS.value)
        except Exception as error:
            # Deliberately broad: kombu, redis and socket errors all mean "not queued", and
            # every one of them must become a 503 so the sender's retry recovers the event.
            # Only the type is logged: broker error messages can contain connection strings.
            logger.error("donor_event_enqueue_failed", error_type=type(error).__name__)
            raise EventCouldNotBeEnqueued() from error
        return ProcessingMode.QUEUED
    # Same fallback as sefaria/helper/crm/tasks.py: local development has no worker.
    process_event_indicating_person_is_donor_task(serialized_event)
    return ProcessingMode.INLINE
