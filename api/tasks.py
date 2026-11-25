"""
Celery tasks for the newsletter (ActiveCampaign) integration.

Follows the same pattern as sefaria/helper/crm/tasks.py: a task that retries once,
plus a dispatch_* function that queues it when Celery is on and runs it right away
when Celery is off.
"""
from typing import Any

import django
import sentry_sdk
import structlog
from django.db import transaction

# UserProfile reads the Django User table, so Django must be set up before a worker
# runs this task (sefaria/helper/texts/tasks.py does the same).
django.setup()

from sefaria.celery_setup.app import app
from sefaria.celery_setup.config import CeleryQueue
from sefaria.settings import CELERY_ENABLED
from sefaria.model.user_profile import UserProfile
from api.newsletter_service import (
    REGISTRATION_PROVIDER_TIMEOUT,
    copy_learning_level_to_new_profile,
    is_newsletter_service_configured,
)

logger = structlog.get_logger(__name__)

# How long to wait before trying AC again. Nobody is waiting on this task, so a
# longer pause gives a brief AC outage time to clear.
COPY_LEARNING_LEVEL_RETRY_SECONDS = 60


@app.task(
    bind=True,
    # Keeps the service function's old name. Queued tasks find their handler by this
    # string, so changing it would strand any task queued before a deploy.
    name="newsletter.copy_learning_level_from_ac",
    max_retries=1,
    acks_late=True,
    ignore_result=True,
)
def copy_learning_level_from_ac_task(self: Any, uid: int) -> None:
    """
    Copy a new user's learning level from ActiveCampaign onto their profile.

    Retries once if AC can't be reached. On final failure the error is logged and
    reported to Sentry, and the profile simply has no learning level.
    """
    try:
        copy_learning_level_to_new_profile(uid)
    except Exception as exc:
        logger.warning(
            "copy_learning_level_from_ac_attempt_failed",
            uid=uid,
            error=str(exc),
            attempt=self.request.retries + 1,
        )

        if self.request.retries < self.max_retries:
            raise self.retry(exc=exc, countdown=COPY_LEARNING_LEVEL_RETRY_SECONDS)

        logger.error("copy_learning_level_from_ac_final_failure", uid=uid, error=str(exc))
        sentry_sdk.capture_exception(exc)


def dispatch_copy_learning_level_from_ac(profile: UserProfile) -> None:
    """
    Start copying a newly registered user's learning level from ActiveCampaign.

    Call this after the new profile's last save. The task only fills in an empty
    learning level, so a save that comes after it would put the empty value back.

    With Celery on, the copy runs in a worker and registration doesn't wait for AC.
    With Celery off, it runs right here with a short timeout. Either way it never
    raises, so a problem with AC can't break registration.
    """
    if not is_newsletter_service_configured():
        return
    # Keep a level the profile already has. A "seed" account (created before the
    # person registered) may already have one saved from the newsletter page.
    if profile.learning_level is not None:
        return

    if CELERY_ENABLED:
        def queue_task() -> None:
            try:
                copy_learning_level_from_ac_task.apply_async(
                    args=[profile.id],
                    queue=CeleryQueue.TASKS.value,
                )
            except Exception:
                # If the queue (Redis) is down, skip the copy rather than fail registration
                logger.warning("copy_learning_level_from_ac_queue_failed", uid=profile.id, exc_info=True)

        # Wait until the new user is committed to the database, so the worker can find them
        transaction.on_commit(queue_task)
    else:
        try:
            learning_level: int | None = copy_learning_level_to_new_profile(profile.id, timeout=REGISTRATION_PROVIDER_TIMEOUT)
            if learning_level is not None:
                # Keep the in-memory profile in step with what was just saved
                profile.learning_level = learning_level
        except Exception:
            logger.warning("copy_learning_level_from_ac_sync_failed", uid=profile.id, exc_info=True)
