"""
Tells other services (Sefaria Social) that a Sefaria account was deleted.

delete_user_account (sefaria/utils/user.py) calls queue_user_deleted_webhooks once the account is
gone. It queues one Celery task per URL in settings.USER_DELETED_WEBHOOK_URLS (empty: nothing is
sent). Each task POSTs the same JSON body, signed with HMAC-SHA256 over the raw body bytes:

    POST <url>
    Content-Type: application/json
    X-Sefaria-Signature: sha256=<lowercase hex HMAC-SHA256(USER_DELETED_WEBHOOK_SECRET, body)>
    X-Sefaria-Event-Id: <id>

    {"event":"user.deleted","id":"<uuid4>","occurred_at":"<ISO 8601 UTC, Z suffix>","user_id":<int>}

`id` is the idempotency key: it is created once per deletion and the body is fixed when queued,
so every retry and every URL gets byte-identical content. Receivers verify the signature over
the raw bytes before parsing, and ignore an id they have already processed.

Nothing here may make the deletion fail: errors are logged and swallowed.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import uuid
from datetime import UTC, datetime

import structlog
from django.conf import settings

logger = structlog.get_logger(__name__)

USER_DELETED_EVENT = "user.deleted"
SIGNATURE_HEADER = "X-Sefaria-Signature"
EVENT_ID_HEADER = "X-Sefaria-Event-Id"
SIGNATURE_PREFIX = "sha256="


def sign_body(secret: str, body: bytes) -> str:
    """The X-Sefaria-Signature header value for `body`."""
    digest = hmac.new(secret.encode("utf-8"), body, hashlib.sha256).hexdigest()
    return SIGNATURE_PREFIX + digest


def build_user_deleted_body(user_id: int, occurred_at: datetime | None = None, event_id: str | None = None) -> str:
    occurred_at = (occurred_at or datetime.now(UTC)).astimezone(UTC)
    payload = {
        "event": USER_DELETED_EVENT,
        "id": event_id or str(uuid.uuid4()),
        "occurred_at": occurred_at.isoformat(timespec="seconds").replace("+00:00", "Z"),
        "user_id": int(user_id),
    }
    return json.dumps(payload, separators=(",", ":"), sort_keys=True)


def user_deleted_webhook_urls() -> list[str]:
    return [url for url in (getattr(settings, "USER_DELETED_WEBHOOK_URLS", None) or []) if url]


def queue_user_deleted_webhooks(user_id: int) -> int:
    """Queues one delivery per configured URL. Returns how many were queued. Never raises."""
    try:
        urls = user_deleted_webhook_urls()
        if not urls:
            return 0
        if not getattr(settings, "USER_DELETED_WEBHOOK_SECRET", None):
            logger.error("user_deleted_webhook_not_configured", reason="USER_DELETED_WEBHOOK_SECRET unset")
            return 0
        from sefaria.celery_setup.config import CeleryQueue
        from sefaria.settings import CELERY_ENABLED
        from sso.tasks import send_user_deleted_webhook

        body = build_user_deleted_body(user_id)
        queued = 0
        for url in urls:
            try:
                if CELERY_ENABLED:
                    send_user_deleted_webhook.apply_async(args=[url, body], queue=CeleryQueue.TASKS.value)
                else:
                    # Local development has no worker (same fallback as sefaria/helper/crm/tasks.py):
                    # one attempt inline, bounded by the request timeouts, no retries.
                    send_user_deleted_webhook(url, body)
                queued += 1
            except Exception as error:
                # Only the type: broker errors can contain connection strings.
                logger.error("user_deleted_webhook_enqueue_failed", user_id=user_id, error_type=type(error).__name__)
        return queued
    except Exception as error:
        logger.error("user_deleted_webhook_enqueue_failed", user_id=user_id, error_type=type(error).__name__)
        return 0
