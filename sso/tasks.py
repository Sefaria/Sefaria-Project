"""
Celery task that delivers one user.deleted webhook to one URL. See sso/user_deleted_webhook.py for
the payload and signature contract.

Conventions follow webhooks/tasks.py: bind=True, acks_late, ignore_result, retries with
exponential backoff for transient failures only.
"""

import json
from typing import Any

import requests
import structlog
from django.conf import settings

from sefaria.celery_setup.app import app
from sso.user_deleted_webhook import EVENT_ID_HEADER, SIGNATURE_HEADER, sign_body

logger = structlog.get_logger(__name__)

# (connect, read) seconds.
REQUEST_TIMEOUT = (5, 10)
MAX_RETRIES = 6


class UserDeletedWebhookServerError(Exception):
    """The receiver answered 5xx. Retried like a network error."""


TRANSIENT_ERRORS = (requests.Timeout, requests.ConnectionError, UserDeletedWebhookServerError)


def retry_countdown_seconds(retries_so_far: int) -> int:
    # 30s, 60s, 120s, 240s, 480s, 960s: about 30 minutes in total.
    return 30 * 2**retries_so_far


def _event_id(body: str) -> str:
    return json.loads(body).get("id", "")


@app.task(
    bind=True,
    name="sso.send_user_deleted_webhook",
    max_retries=MAX_RETRIES,
    acks_late=True,
    ignore_result=True,
)
def send_user_deleted_webhook(self: Any, url: str, body: str) -> None:
    """
    POSTs `body` (already-serialized JSON, sent byte for byte) to `url`, signed with
    USER_DELETED_WEBHOOK_SECRET. The secret is read here, in the worker, so it never travels
    through the broker. 2xx is success; 4xx gives up at once (retrying can't fix it); 5xx and
    network errors retry with backoff.
    """
    secret = getattr(settings, "USER_DELETED_WEBHOOK_SECRET", None)
    event_id = _event_id(body)
    if not secret:
        logger.error("user_deleted_webhook_not_configured", event_id=event_id)
        return
    raw_body = body.encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        SIGNATURE_HEADER: sign_body(secret, raw_body),
        EVENT_ID_HEADER: event_id,
    }
    try:
        response = requests.post(url, data=raw_body, headers=headers, timeout=REQUEST_TIMEOUT)
        if response.status_code >= 500:
            raise UserDeletedWebhookServerError(response.status_code)
    except TRANSIENT_ERRORS as error:
        if self.request.called_directly:
            # Inline mode (no worker): nothing will retry, and the deletion must not fail.
            logger.error("user_deleted_webhook_failed_inline", event_id=event_id, error_type=type(error).__name__)
            return
        if self.request.retries >= self.max_retries:
            # Alert on this event: the receiver needs a manual purge for this user.
            logger.error("user_deleted_webhook_gave_up", event_id=event_id, error_type=type(error).__name__)
            return
        logger.warning(
            "user_deleted_webhook_retrying",
            event_id=event_id,
            error_type=type(error).__name__,
            attempt=self.request.retries + 1,
        )
        raise self.retry(exc=error, countdown=retry_countdown_seconds(self.request.retries))

    if response.status_code >= 400:
        logger.error("user_deleted_webhook_rejected", event_id=event_id, status_code=response.status_code)
        return
    logger.info("user_deleted_webhook_delivered", event_id=event_id, status_code=response.status_code)
