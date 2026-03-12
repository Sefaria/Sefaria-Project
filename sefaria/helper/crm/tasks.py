import uuid
from typing import Any

import requests
import sentry_sdk
import structlog

from sefaria.celery_setup.app import app

logger = structlog.get_logger(__name__)

CHATBOT_OPT_IN_WEBHOOK_URL = (
    "https://sefariainc.my.salesforce-sites.com/services/apexrest/Streams/webhookflow"
)


@app.task(
    bind=True,
    name="crm.send_chatbot_opt_in_webhook",
    max_retries=1,
    acks_late=True,
    ignore_result=True,
)
def send_chatbot_opt_in_webhook(self: Any, email: str, opt_in: bool) -> None:
    """
    POST a chatbot experiment opt-in/opt-out event to the Salesforce webhook.

    Retries once after 2 seconds on failure.  On final failure the error is
    logged and reported to Sentry.
    """
    payload = {
        "id": str(uuid.uuid4()),
        "data": {
            "email": email,
            "optIn": opt_in,
        },
    }

    try:
        response = requests.post(
            CHATBOT_OPT_IN_WEBHOOK_URL,
            json=payload,
            timeout=10,
        )
        response.raise_for_status()

        resp_json = response.json()
        if not resp_json.get("success"):
            error_msg = resp_json.get("error", "Unknown error")
            raise RuntimeError(
                f"Webhook returned success=false: {error_msg}"
            )

    except Exception as exc:
        error_detail = extract_error_detail(exc)
        logger.warning(
            "chatbot_opt_in_webhook_attempt_failed",
            email=email,
            error=error_detail,
            attempt=self.request.retries + 1,
        )

        if self.request.retries < self.max_retries:
            raise self.retry(exc=exc, countdown=2)

        logger.error(
            "chatbot_opt_in_webhook_final_failure",
            email=email,
            error=error_detail,
        )
        sentry_sdk.capture_exception(exc)


def extract_error_detail(exc: Exception) -> str:
    """
    Return a human-readable error string from *exc*.

    Handles three cases:
    - requests.HTTPError with a JSON body containing an ``error`` key
    - requests.HTTPError with a plain-text body (Salesforce FlowException)
    - Any other exception (connection errors, timeouts, RuntimeError, etc.)
    """
    if isinstance(exc, requests.HTTPError) and exc.response is not None:
        try:
            body = exc.response.json()
            return body.get("error", exc.response.text)
        except (ValueError, AttributeError):
            return exc.response.text[:500]
    return str(exc)
