"""Publishing a task to the broker, and answering a broker refusal honestly.

A publish the broker refuses means the task was not queued and a later retry can succeed,
because a Redis Sentinel failover moves the master to another pod. A view answers that
refusal with 503 so the caller retries, and keeps a 500 for failures of our own code (the
rule webhooks/dispatcher.py states for its endpoint).
"""

import kombu.exceptions
import structlog

from sefaria.celery_setup.app import app as celery_app

logger = structlog.get_logger(__name__)

# The transport's own list of broker failures, plus the OperationalError kombu raises once
# a publish retry is exhausted. Building the tuple resolves a Connection object; it does
# not open a connection.
BROKER_REFUSAL_ERRORS = tuple(
    dict.fromkeys((*celery_app.connection_for_write().recoverable_connection_errors, kombu.exceptions.OperationalError))
)


class TaskCouldNotBeEnqueued(Exception):
    """The broker refused the task. Nothing is queued, so the caller must retry later."""


def enqueue_task(task, *, queue, args=(), kwargs=None, **options):
    try:
        return task.apply_async(args=args, kwargs=kwargs, queue=queue, **options)
    except BROKER_REFUSAL_ERRORS as error:
        # Only the type is logged, because a broker error message can carry the connection
        # string. The raised exception keeps the original as its cause.
        logger.error("task_enqueue_failed", task=task.name, queue=queue, error_type=type(error).__name__)
        raise TaskCouldNotBeEnqueued from error
