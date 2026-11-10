"""Background deletion of user accounts.

Deleting an account touches Salesforce, several Mongo collections and Postgres.
It has taken 92-202s in production, longer than the proxy in front of Django
waits, so the admin page timed out and admins submitted again. The admin view
now queues this task and returns at once.
"""

import sentry_sdk
import structlog

from sefaria.celery_setup.app import app
from sefaria.celery_setup.config import CeleryQueue
from sefaria.settings import CELERY_ENABLED

logger = structlog.get_logger(__name__)

DELETE_USER_MAX_RETRIES = 3


@app.task(
    bind=True,
    name="web.delete_user_account",
    acks_late=True,
    # acks_late alone does not cover a killed worker process: Celery still acks the
    # message when the child running it dies (SIGKILL, OOM), so the task would never
    # run again. This puts the message back on the queue instead.
    reject_on_worker_lost=True,
    max_retries=DELETE_USER_MAX_RETRIES,
)
def delete_user_account_task(self, uid: int) -> dict:
    """Delete `uid` and everything they own.

    Retries are safe because delete_user_account() can be re-run for the same uid
    (see its docstring). acks_late plus reject_on_worker_lost means a worker killed
    mid-run hands the task back to the queue, and the next run finishes the job
    instead of leaving a user whose content is gone but who can still log in. If
    the whole pod dies, the Redis broker redelivers the unacked message after its
    visibility timeout (1 hour by default).
    """
    from sefaria.utils.user import delete_user_account

    try:
        delete_user_account(uid, confirm=False)
    except Exception as exc:
        if self.request.retries < self.max_retries:
            # 60s, 120s, 240s
            countdown = 60 * (2**self.request.retries)
            logger.warning(
                "delete_user_account_task:retrying",
                uid=uid,
                attempt=self.request.retries + 1,
                countdown=countdown,
                error=f"{type(exc).__name__}: {exc}",
            )
            raise self.retry(exc=exc, countdown=countdown)
        # Out of retries: the user may be partly deleted. Re-queue by hand (the
        # task is safe to re-run) once the cause is fixed.
        logger.error("delete_user_account_task:failed", uid=uid, error=f"{type(exc).__name__}: {exc}")
        sentry_sdk.capture_exception(exc)
        raise
    logger.info("delete_user_account_task:done", uid=uid)
    return {"uid": uid, "deleted": True}


def queue_user_account_deletion(uid: int):
    """Queue deletion of `uid`. Returns the AsyncResult, or None if Celery is off.

    Without Celery (local dev), the deletion runs inline and errors propagate.
    """
    if CELERY_ENABLED:
        return delete_user_account_task.apply_async(args=[uid], queue=CeleryQueue.TASKS.value)
    from sefaria.utils.user import delete_user_account

    delete_user_account(uid, confirm=False)
    return None
